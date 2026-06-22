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
