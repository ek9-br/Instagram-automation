// Pipeline de posts: encadeia os 4 agentes via o motor compartilhado (engine.mjs).
// Ordem: post-strategist → carousel-writer → image-prompt-writer → reviewer.

import { runStages } from "./engine.mjs";

const STAGES = ["post-strategist", "carousel-writer", "image-prompt-writer", "reviewer"];

// Roda o pipeline completo a partir de um post-request, devolve o post-response.
export async function runPipeline(request, log = () => {}) {
  return runStages(STAGES, request, { log });
}

export { STAGES };

// ---------------------------------------------------------------------------
// Modo mock: gera um post-response VÁLIDO sem chamar o Claude. Serve para
// testar a fila/worker/validação/escrita ponta a ponta enquanto o headless do
// Claude Code não está habilitado. Trocar por runPipeline quando estiver.
// ---------------------------------------------------------------------------
// Formatos de anúncio da Meta (usados no tipo "criativo").
const META_FORMATS = [
  { id: "feed_1_1", label: "Feed 1:1", aspect: "square" },
  { id: "feed_3_4", label: "Feed 3:4", aspect: "portrait" },
  { id: "story_9_16", label: "Stories / Reels 9:16", aspect: "portrait" },
  { id: "land_191", label: "Paisagem 1.91:1", aspect: "landscape" },
];

export function runMockPipeline(request, tipo) {
  const { job_id, brand = "Acme", format, briefing = "", audience } = request;
  const theme = (briefing.split(".")[0] || briefing || "Tema").trim();
  const isCarousel = format === "carousel_3x4";
  const isCreative = tipo === "criativo";
  const aspect = format === "ads_landscape_1_91_1" ? "landscape" : "portrait";
  const safe_area =
    format === "stories_9x16" || format === "reels_cover_9x16"
      ? { top_pct: 14, bottom_pct: 18, side_pct: 8 }
      : format === "ads_landscape_1_91_1"
        ? { top_pct: 6, bottom_pct: 6, side_pct: 6 }
        : { top_pct: 8, bottom_pct: 8, side_pct: 8 };

  const m = briefing.match(/(\d+)\s*slides/i);
  const n = isCarousel ? Math.max(2, m ? parseInt(m[1], 10) : 4) : 1;

  const slides = [];
  const image_prompts = [];
  const promptFor = (title, target, asp, label) => ({
    target,
    ...(label ? { label } : {}),
    prompt: `Arte ${asp} para "${title}", paleta da marca ${brand}, ponto focal claro, espaço reservado para o texto na safe area, sem texto embutido.`,
    aspect: asp,
    negative: "sem texto embutido, sem marcas d'água, sem distorções",
    references: [],
  });

  if (isCreative) {
    // Criativo: uma peça/prompt por formato de anúncio da Meta.
    slides.push({ index: 1, role: "cover", title: theme, body: "Criativo (mock)." });
    for (const f of META_FORMATS) {
      image_prompts.push(promptFor(theme, `format:${f.id}`, f.aspect, f.label));
    }
  } else if (isCarousel) {
    slides.push({ index: 1, role: "cover", title: theme, body: "Capa (mock)." });
    for (let i = 2; i < n; i++) {
      slides.push({ index: i, role: "content", title: `Ponto ${i - 1}`, body: `Conteúdo do slide ${i} (mock).` });
    }
    slides.push({ index: n, role: "cta", title: "Comece hoje", body: "CTA final (mock)." });
    for (const s of slides) image_prompts.push(promptFor(s.title, `slide:${s.index}`, aspect));
  } else {
    slides.push({ index: 1, role: "cover", title: theme, body: "Peça única (mock)." });
    image_prompts.push(promptFor(theme, "single", aspect));
  }

  return {
    job_id,
    brand,
    format,
    theme,
    angle: "Abordagem mock derivada do briefing.",
    promise: "Benefício claro para a audiência (mock).",
    target_audience: audience || "Persona padrão",
    selected_template: isCarousel ? "erros_comuns" : "aida",
    caption: `${theme} — legenda gerada em modo mock.`,
    cta: "Salve este post",
    slides,
    image_prompts,
    safe_area,
    review: {
      score: 80,
      checks: { quality: true, consistency: true, brand: true, template: true },
      issues: [],
      suggestions: [
        "Gerado em modo mock — substituir pelo pipeline real quando o Claude Code headless estiver habilitado.",
      ],
    },
    status: "needs_review",
  };
}
