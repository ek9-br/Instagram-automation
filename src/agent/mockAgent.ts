import type { ImageUnit, MetaFormat, Post } from "../types";
import { META_FORMATS } from "../types";

// Stub do agente de geração. Hoje devolve texto mock derivado dos inputs.
// Futuramente: chamada ao backend (OpenAI) atrás de uma interface igual a esta.

export interface GeneratedContent {
  images: ImageUnit[];
  textoLegenda: string;
}

// Labels resolvidos das tabelas de lookup (vêm do banco, resolvidos no caller).
export interface ContentLabels {
  sentimento: string;
  angulo: string;
  cta: string;
  legenda: string;
  template: string;
}

export const CARROSSEL_SLIDES_PADRAO = 3;

let unitCounter = 0;
function unitId() {
  unitCounter += 1;
  return `img_${Date.now()}_${unitCounter}`;
}

export function generateContent(post: Post, labels: ContentLabels): GeneratedContent {
  const { sentimento, angulo, cta, legenda, template } = labels;
  const tema = post.tema || "(sem tema)";

  const basePrompt = (extra: string) =>
    `Imagem estilo "${template}", tema "${tema}", sentimento ${sentimento}, ângulo ${angulo}. ${extra} Alta qualidade, pronta para Instagram.`;

  let images: ImageUnit[] = [];

  if (post.tipo === "post") {
    images = [
      {
        id: unitId(),
        label: "Imagem",
        textoImagem: `${tema.toUpperCase()}\n\n${angulo} · tom ${sentimento.toLowerCase()}`,
        promptImagem: basePrompt("Composição limpa e única."),
        imagemUrl: null,
        referenceImageIds: [],
      },
    ];
  } else if (post.tipo === "carrossel") {
    const total = Math.max(1, post.slidesCount || CARROSSEL_SLIDES_PADRAO);
    images = Array.from({ length: total }, (_, i) => ({
      id: unitId(),
      label: `Slide ${i + 1}`,
      textoImagem:
        i === 0
          ? `${tema.toUpperCase()}\n\n(capa)`
          : `Ponto ${i} sobre ${tema}`,
      promptImagem: basePrompt(`Slide ${i + 1} de ${total} de um carrossel coeso.`),
      imagemUrl: null,
      referenceImageIds: [],
    }));
  } else {
    // criativo: uma imagem por formato de anúncio da Meta
    images = META_FORMATS.map((f) => ({
      id: unitId(),
      label: f.label,
      formatId: f.id,
      textoImagem: `${tema.toUpperCase()}\n\n${cta}`,
      promptImagem: basePrompt(`Formato de anúncio ${f.label} (${f.w}x${f.h}).`),
      imagemUrl: null,
      referenceImageIds: [],
    }));
  }

  return {
    images,
    textoLegenda: `${tema} ✨\n\nAbordagem ${angulo.toLowerCase()} com um toque ${sentimento.toLowerCase()}. (legenda ${legenda.toLowerCase()})\n\n👉 ${cta}`,
  };
}

// Cria um slide vazio adicional para carrossel.
export function newSlide(index: number): ImageUnit {
  return {
    id: unitId(),
    label: `Slide ${index}`,
    textoImagem: "",
    promptImagem: "",
    imagemUrl: null,
    referenceImageIds: [],
  };
}

// Stub da geração de imagem. Hoje devolve um placeholder com as dimensões do
// formato. Futuramente: chamada ao gerador de imagens real.
export function generateImage(prompt: string, format?: MetaFormat): string {
  const w = format?.w ?? 1080;
  const h = format?.h ?? 1080;
  const seed = encodeURIComponent(prompt.slice(0, 30) + Date.now());
  return `https://placehold.co/${w}x${h}/1e293b/e2e8f0/png?text=${seed}`;
}
