import { useSyncExternalStore } from "react";
import type { Creative } from "../types";

// Store de criativos: em memória + localStorage (mesmo padrão de store.ts).
// As imagens em si ficam permanentes no Supabase Storage; aqui guardamos só as
// linhas (formato, prompt, URLs).

const STORAGE_KEY = "paa.creatives.v1";

const VALID = new Set(["idle", "generating", "safezoning", "regenerating", "error"]);

function load(): Creative[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Creative[]) : [];
    // Normaliza ao carregar: garante os campos novos e zera status transitório
    // (nenhuma operação está em andamento após um reload).
    return list.map((c) => ({
      ...c,
      safezoneUrl: c.safezoneUrl ?? null,
      finalUrl: c.finalUrl ?? null,
      status: VALID.has(c.status) && c.status !== "generating" && c.status !== "safezoning" && c.status !== "regenerating"
        ? c.status
        : "idle",
    }));
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
