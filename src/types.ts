// Tipos canônicos do front-end.
// Os "Option" representam linhas que futuramente virão das tabelas do Supabase.

export type PostTipo = "post" | "carrossel" | "criativo";
export type PostStatus = "ideia" | "texto_gerado" | "pronto";

export interface Option {
  id: string;
  label: string;
}

// Formatos de anúncio da Meta (usados no tipo "criativo").
export interface MetaFormat {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const META_FORMATS: MetaFormat[] = [
  { id: "feed_1_1", label: "Feed 1:1", w: 1080, h: 1080 },
  { id: "feed_3_4", label: "Feed 3:4", w: 1080, h: 1440 },
  { id: "story_9_16", label: "Stories / Reels 9:16", w: 1080, h: 1920 },
  { id: "land_191", label: "Paisagem 1.91:1", w: 1200, h: 628 },
];

// Uma unidade de imagem: um slide do carrossel, a imagem do post,
// ou uma das variações de formato do criativo.
export interface ImageUnit {
  id: string;
  label: string; // "Imagem", "Slide 1", "Feed 1:1"...
  formatId?: string; // referência a META_FORMATS (apenas no criativo)
  textoImagem: string;
  promptImagem: string;
  imagemUrl: string | null;
  referenceImageIds: string[]; // imagens de referência (banco) anexadas ao prompt
}

export interface Post {
  id: string;
  tipo: PostTipo;
  tema: string;
  sentimentoId: string | null;
  anguloId: string | null;
  ctaId: string | null;
  legendaId: string | null;
  templateId: string | null;
  slidesCount: number; // usado apenas quando tipo === "carrossel"
  status: PostStatus;
  jobId: string | null; // job criado na fila (create-job), quando houver

  // Preenchidos pelo agente após "Gerar"
  images: ImageUnit[];
  textoLegenda: string;
}

export const TIPO_LABELS: Record<PostTipo, string> = {
  post: "Post",
  carrossel: "Carrossel",
  criativo: "Criativo",
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  ideia: "Ideia",
  texto_gerado: "Texto gerado",
  pronto: "Pronto",
};

export function formatOf(unit: ImageUnit): MetaFormat | undefined {
  return META_FORMATS.find((f) => f.id === unit.formatId);
}

// ---- Criativos (página dedicada: prompt → gera imagem → aplica safezone) ----

export type CreativeStatus = "idle" | "generating" | "safezone" | "done" | "error";

export interface CreativeFormat {
  id: string; // valor salvo no Creative
  label: string;
  safeguard: string; // id do formato na edge function apply-safeguard
  w: number;
  h: number;
}

export const CREATIVE_FORMATS: CreativeFormat[] = [
  { id: "9_16", label: "9:16 (Stories/Reels)", safeguard: "story_9_16", w: 1080, h: 1920 },
  { id: "3_4", label: "3:4 (Feed)", safeguard: "feed_3_4", w: 1080, h: 1440 },
  { id: "4_5", label: "4:5 (Feed)", safeguard: "feed_4_5", w: 1080, h: 1350 },
];

export interface Creative {
  id: string;
  formatId: string; // CREATIVE_FORMATS.id
  prompt: string;
  status: CreativeStatus;
  rawUrl: string | null; // imagem gerada (antes da safezone)
  finalUrl: string | null; // imagem com a safezone aplicada (resultado final)
  error: string | null;
}

export function creativeFormatOf(c: Creative): CreativeFormat | undefined {
  return CREATIVE_FORMATS.find((f) => f.id === c.formatId);
}
