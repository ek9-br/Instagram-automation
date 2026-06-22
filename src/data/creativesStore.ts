import { useSyncExternalStore } from "react";
import type { Creative } from "../types";

// Store de criativos: em memória + localStorage (mesmo padrão de store.ts).
// As imagens em si ficam permanentes no Supabase Storage; aqui guardamos só as
// linhas (formato, prompt, URLs).

const STORAGE_KEY = "paa.creatives.v1";

function load(): Creative[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Creative[]) : [];
    // status transitório não sobrevive a reload: normaliza ao carregar.
    return list.map((c) =>
      c.status === "generating" || c.status === "safezone"
        ? { ...c, status: c.finalUrl ? "done" : "idle" }
        : c
    );
  } catch {
    return [];
  }
}

let creatives: Creative[] = load();
const listeners = new Set<() => void>();

function emit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creatives));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCreatives(): Creative[] {
  return useSyncExternalStore(subscribe, () => creatives);
}

export function upsertCreative(c: Creative) {
  const idx = creatives.findIndex((x) => x.id === c.id);
  creatives = idx >= 0 ? creatives.map((x) => (x.id === c.id ? c : x)) : [...creatives, c];
  emit();
}

export function deleteCreative(id: string) {
  creatives = creatives.filter((c) => c.id !== id);
  emit();
}

export function newCreativeId(): string {
  return `cre_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}
