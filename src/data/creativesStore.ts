import { useSyncExternalStore } from "react";
import type { Creative } from "../types";
import { supabase } from "../lib/supabase";

// Store de criativos COMPARTILHADO (tabela `creatives` no Supabase): todos da
// equipe veem/editam os mesmos criativos, com sincronização ao vivo (Realtime).
// Mantém um cache em memória + listeners (mesma API de antes para a UI).

interface Row {
  id: string;
  data: Creative;
  created_by: string | null;
}

let creatives: Creative[] = [];
const listeners = new Set<() => void>();
let started = false;

function emit() {
  listeners.forEach((l) => l());
}

function rowToCreative(row: Row): Creative {
  return { ...(row.data || ({} as Creative)), id: row.id, createdBy: row.created_by ?? row.data?.createdBy };
}

function upsertLocal(c: Creative) {
  const i = creatives.findIndex((x) => x.id === c.id);
  creatives = i >= 0 ? creatives.map((x) => (x.id === c.id ? c : x)) : [...creatives, c];
}

async function loadAll() {
  const { data, error } = await supabase
    .from("creatives")
    .select("id,data,created_by")
    .order("created_at", { ascending: true });
  if (!error && data) {
    creatives = (data as Row[]).map(rowToCreative);
    emit();
  }
}

function start() {
  if (started) return;
  started = true;
  void loadAll();
  // Sincronização ao vivo: aplica mudanças de qualquer membro da equipe.
  supabase
    .channel("creatives-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "creatives" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string })?.id;
        if (id) creatives = creatives.filter((c) => c.id !== id);
      } else {
        upsertLocal(rowToCreative(payload.new as Row));
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

export function useCreatives(): Creative[] {
  return useSyncExternalStore(subscribe, () => creatives);
}

// Otimista: atualiza o cache e persiste no Supabase (o Realtime confirma/propaga).
export function upsertCreative(c: Creative) {
  upsertLocal(c);
  emit();
  void supabase
    .from("creatives")
    .upsert({ id: c.id, data: c, created_by: c.createdBy ?? null })
    .then(({ error }) => {
      if (error) console.error("[creatives] upsert:", error.message);
    });
}

export function deleteCreative(id: string) {
  creatives = creatives.filter((c) => c.id !== id);
  emit();
  void supabase
    .from("creatives")
    .delete()
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("[creatives] delete:", error.message);
    });
}

export function newCreativeId(): string {
  return crypto.randomUUID();
}
