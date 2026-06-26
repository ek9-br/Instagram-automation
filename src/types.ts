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
  createdBy?: string; // e-mail de quem criou (posts são compartilhados)
  tipo: PostTipo;
  tema: string;
  sentimentoIds: string[]; // multi-select: 1+ sentimentos/tons
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

export type CreativeStatus =
  | "idle"
  | "generating" // gerando a imagem crua
  | "revising" // worker regerando prompt+imagem a partir do comentário de revisão
  | "safezoning" // aplicando a safezone preta
  | "regenerating" // regerando na OpenAI para trocar o fundo preto
  | "error";

export interface CreativeFormat {
  id: string; // valor salvo no Creative
  label: string;
  safeguard: string; // id do formato na edge function apply-safeguard
  w: number;
  h: number;
}

export const CREATIVE_FORMATS: CreativeFormat[] = [
  { id: "9_16", label: "9:16 (Stories)", safeguard: "story_9_16", w: 1080, h: 1920 },
  { id: "9_16_reels", label: "9:16 (Reels)", safeguard: "story_9_16", w: 1080, h: 1920 },
  { id: "3_4", label: "3:4 (Feed)", safeguard: "feed_3_4", w: 1080, h: 1440 },
  { id: "4_5", label: "4:5 (Feed)", safeguard: "feed_4_5", w: 1080, h: 1350 },
];

// Estilo visual (paleta/fundo) aplicado à imagem — fixo por enquanto.
export const ESTILOS = ["Claro", "Azul escuro", "Verde Escuro"] as const;

export interface Creative {
  id: string;
  formatId: string; // CREATIVE_FORMATS.id
  prompt: string;
  estilo?: string; // ESTILOS
  referenceImageIds: string[]; // imagens do banco enviadas no payload da OpenAI
  createdBy?: string; // e-mail de quem criou (criativos são compartilhados)
  status: CreativeStatus;
  rawUrl: string | null; // 1) imagem gerada (crua)
  safezoneUrl: string | null; // 2) safezone preta aplicada
  finalUrl: string | null; // 3) regerada: fundo preto trocado por continuação natural
  error: string | null;
  // Revisão: comentário do humano → worker gera novo prompt + nova imagem (rawUrl).
  revision?: string;
  revisionStatus?: "idle" | "requested" | "done" | "error";
  revisionNote?: string; // resumo do que a revisão aprendeu/alterou (estilo)
}

export function creativeFormatOf(c: Creative): CreativeFormat | undefined {
  return CREATIVE_FORMATS.find((f) => f.id === c.formatId);
}

// ---- Safezone do Instagram (2026) — margens reservadas pela UI, por formato ----
// Percentuais da imagem. O conteúdo importante (texto, logo, rosto) deve ficar
// DENTRO da área central (fora destas faixas).

export interface SafezoneSpec {
  top: number; // % reservado no topo
  bottom: number; // % reservado na base
  left: number; // % reservado à esquerda
  right: number; // % reservado à direita
  zones: { side: "top" | "bottom" | "left" | "right"; label: string }[];
}

// Fontes: outfy.com/blog/instagram-safe-zone (px específicos do Reels/Stories) e
// zeely.ai/blog/master-instagram-safe-zones (regra do "80% central"). Os px foram
// convertidos para % sobre o canvas 1080×1920. As fontes variam um pouco; usei o
// perfil de Reels (mais restritivo, com coluna de botões à direita) para o 9:16.
export const INSTAGRAM_SAFEZONES: Record<string, SafezoneSpec> = {
  // Stories (1080×1920): topo ~250px (~13%, foto/nome do perfil) e base ~250px
  // (~13%, barra de resposta / sticker de link). Sem coluna de botões à direita;
  // margem lateral leve para stickers. Fonte: outfy.com/blog/instagram-safe-zone.
  "9_16": {
    top: 13,
    bottom: 13,
    left: 5,
    right: 5,
    zones: [
      { side: "top", label: "Perfil / nome" },
      { side: "bottom", label: "Resposta · link · stickers" },
    ],
  },
  // Reels (1080×1920): topo 108px (~6%), base 320px (~17%), esquerda 60px (~6%),
  // direita 120px (~11%, coluna de curtir/comentar/enviar/salvar).
  "9_16_reels": {
    top: 6,
    bottom: 17,
    left: 6,
    right: 11,
    zones: [
      { side: "top", label: "Perfil / ícones" },
      { side: "right", label: "Botões" },
      { side: "bottom", label: "Legenda · botões · CTA" },
    ],
  },
  // Feed 4:5 (1080×1350): o feed não sobrepõe UI nem corta — canvas cheio é seguro.
  // Mantemos só uma margem leve de "título seguro" (regra do 80% central).
  "4_5": {
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    zones: [{ side: "bottom", label: "Margem segura (feed não corta)" }],
  },
  // Feed 3:4 (1080×1440): mais alto que a grade do perfil (4:5) → topo/base podem
  // ser cortados na pré-visualização da grade.
  "3_4": {
    top: 5,
    bottom: 5,
    left: 4,
    right: 4,
    zones: [
      { side: "top", label: "Corte na grade 4:5" },
      { side: "bottom", label: "Corte na grade 4:5" },
    ],
  },
};
