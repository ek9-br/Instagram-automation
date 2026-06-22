import { useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";

// Banco de imagens do app.
// - "asset": imagens de referência subidas pelo usuário, lidas do bucket
//   `reference-images` do Supabase Storage (fonte de verdade).
// - "gerada": saídas da IA adicionadas em runtime via addImage(), persistidas em
//   localStorage para sobreviver a reloads.
// Ambas ficam selecionáveis como referência ao gerar imagem.

export type ImageOrigin = "asset" | "gerada";

export interface BankImage {
  id: string;
  name: string;
  url: string;
  origin: ImageOrigin; // asset = subido pelo usuário; gerada = saída da IA
}

export const ORIGIN_LABELS: Record<ImageOrigin, string> = {
  asset: "Assets",
  gerada: "Geradas",
};

export const REFERENCE_BUCKET = "reference-images";
const STORAGE_KEY = "paa.imagebank.generated.v1";

function loadGenerated(): BankImage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BankImage[];
  } catch {
    /* ignore */
  }
  return [];
}

let assets: BankImage[] = [];
let generated: BankImage[] = loadGenerated();
let images: BankImage[] = [...assets, ...generated];
const listeners = new Set<() => void>();
let assetsLoaded = false;

function recompute() {
  images = [...assets, ...generated];
}

function emit() {
  recompute();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(generated));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function niceName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || filename;
}

// Lê os assets do bucket de referências (uma vez, ao primeiro uso).
async function loadAssets() {
  const { data, error } = await supabase.storage
    .from(REFERENCE_BUCKET)
    .list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return;
  assets = data
    .filter((o) => o.id !== null) // ignora "pastas" (entradas sem id)
    .map((o) => ({
      id: `asset:${o.name}`,
      name: niceName(o.name),
      url: supabase.storage.from(REFERENCE_BUCKET).getPublicUrl(o.name).data.publicUrl,
      origin: "asset" as const,
    }));
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!assetsLoaded) {
    assetsLoaded = true;
    void loadAssets();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useImageBank(): BankImage[] {
  return useSyncExternalStore(subscribe, () => images);
}

export function listImages(): BankImage[] {
  return images;
}

export function imagesByIds(ids: string[]): BankImage[] {
  return images.filter((b) => ids.includes(b.id));
}

// Adiciona uma imagem ao banco em runtime e devolve o registro criado.
export function addImage(url: string, name: string, origin: ImageOrigin = "gerada"): BankImage {
  const item: BankImage = {
    id: `bank_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name,
    url,
    origin,
  };
  if (origin === "asset") assets = [item, ...assets];
  else generated = [item, ...generated];
  emit();
  return item;
}
