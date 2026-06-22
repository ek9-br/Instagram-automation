import { useSyncExternalStore } from "react";

// Banco de imagens (fonte única: Supabase). Hoje mock persistido em
// localStorage, já no formato que o Supabase Storage + tabela vão usar:
// addImage() vira upload + insert; useImageBank() vira a leitura da tabela.
//
// Toda imagem gerada pela app é adicionada aqui via addImage(), então pode
// ser selecionada como referência depois — inclusive novas versões.

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

const STORAGE_KEY = "paa.imagebank.v1";

function seed(): BankImage[] {
  const assets: [string, string][] = [
    ["logo-claro", "Logo (claro)"],
    ["logo-escuro", "Logo (escuro)"],
    ["textura-1", "Textura abstrata"],
    ["paleta-marca", "Paleta da marca"],
    ["produto-frente", "Produto - frente"],
    ["produto-detalhe", "Produto - detalhe"],
    ["equipe", "Foto da equipe"],
    ["evento", "Evento"],
  ];
  return assets.map(([id, name]) => ({
    id,
    name,
    url: `https://picsum.photos/seed/${id}/240/240`,
    origin: "asset" as const,
  }));
}

function load(): BankImage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BankImage[];
  } catch {
    /* ignore */
  }
  return seed();
}

let images: BankImage[] = load();
const listeners = new Set<() => void>();

function emit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

// Adiciona uma imagem ao banco e devolve o registro criado.
export function addImage(url: string, name: string, origin: ImageOrigin = "gerada"): BankImage {
  const item: BankImage = {
    id: `bank_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name,
    url,
    origin,
  };
  images = [item, ...images];
  emit();
  return item;
}
