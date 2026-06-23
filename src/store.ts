import { useSyncExternalStore } from "react";
import type { Post } from "./types";
import { supabase } from "./lib/supabase";

// Store de posts COMPARTILHADO (tabela `post_board` no Supabase): todos da equipe
// veem/editam os mesmos posts, com sincronização ao vivo (Realtime). Cache em
// memória + listeners — mesma API de antes para a UI.

interface Row {
  id: string;
  data: Post;
  created_by: string | null;
}

let posts: Post[] = [];
let loaded = false;
const listeners = new Set<() => void>();
let started = false;

function emit() {
  listeners.forEach((l) => l());
}

function rowToPost(row: Row): Post {
  return { ...(row.data || ({} as Post)), id: row.id, createdBy: row.created_by ?? row.data?.createdBy };
}

function upsertLocal(p: Post) {
  const i = posts.findIndex((x) => x.id === p.id);
  posts = i >= 0 ? posts.map((x) => (x.id === p.id ? p : x)) : [...posts, p];
}

async function loadAll() {
  const { data, error } = await supabase
    .from("post_board")
    .select("id,data,created_by")
    .order("created_at", { ascending: true });
  if (!error && data) posts = (data as Row[]).map(rowToPost);
  loaded = true;
  emit();
}

function start() {
  if (started) return;
  started = true;
  void loadAll();
  supabase
    .channel("post-board-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "post_board" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string })?.id;
        if (id) posts = posts.filter((p) => p.id !== id);
      } else {
        upsertLocal(rowToPost(payload.new as Row));
      }
      emit();
    })
    .subscribe();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function usePosts(): Post[] {
  return useSyncExternalStore(subscribe, () => posts);
}

// Indica se o carregamento inicial do Supabase já terminou (evita "não encontrado"
// piscando antes de carregar).
export function usePostsLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}

export function getPost(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}

export function upsertPost(post: Post) {
  upsertLocal(post);
  emit();
  void supabase
    .from("post_board")
    .upsert({ id: post.id, data: post, created_by: post.createdBy ?? null })
    .then(({ error }) => {
      if (error) console.error("[posts] upsert:", error.message);
    });
}

export function deletePost(id: string) {
  posts = posts.filter((p) => p.id !== id);
  emit();
  void supabase
    .from("post_board")
    .delete()
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("[posts] delete:", error.message);
    });
}

export function newPostId(): string {
  return crypto.randomUUID();
}
