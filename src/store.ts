import { useSyncExternalStore } from "react";
import type { Post } from "./types";

// Store simples em memória + localStorage. Substituível por Supabase depois:
// as funções (listPosts, getPost, upsertPost) viram chamadas assíncronas.

const STORAGE_KEY = "paa.posts.v2";

function load(): Post[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Post[]) : [];
  } catch {
    return [];
  }
}

let posts: Post[] = load();
const listeners = new Set<() => void>();

function emit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePosts(): Post[] {
  return useSyncExternalStore(subscribe, () => posts);
}

export function getPost(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}

export function upsertPost(post: Post) {
  const idx = posts.findIndex((p) => p.id === post.id);
  posts = idx >= 0 ? posts.map((p) => (p.id === post.id ? post : p)) : [...posts, post];
  emit();
}

export function deletePost(id: string) {
  posts = posts.filter((p) => p.id !== id);
  emit();
}

export function newPostId(): string {
  return `post_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}
