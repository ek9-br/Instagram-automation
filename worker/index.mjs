// Worker local — polling da fila de jobs no Supabase.
// Para cada job 'pending': reivindica (→ 'processing'), roda o pipeline de
// agentes, valida a saída contra o schema e grava o resultado (→ 'done'/'error').
//
// Uso:
//   node index.mjs           # loop contínuo (polling)
//   node index.mjs --once    # processa no máximo 1 job e sai (útil para testes)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { runPipeline, runMockPipeline } from "./pipeline.mjs";
import { runClaudeJson } from "./engine.mjs";
import { attachImages, DEFAULT_FN } from "./images.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ONCE = process.argv.includes("--once");
const MOCK = process.argv.includes("--mock");

// ---- carregar .env (parser mínimo, sem dependência) -----------------------
async function loadEnv() {
  try {
    const raw = await readFile(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env opcional se as vars já estiverem no ambiente */
  }
}

await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const GENERATE_IMAGES = String(process.env.GENERATE_IMAGES).toLowerCase() === "true";
const IMAGE_FN_URL = process.env.IMAGE_FN_URL || (SUPABASE_URL ? DEFAULT_FN(SUPABASE_URL) : "");

if (!SUPABASE_URL || !KEY) {
  console.error("Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (ver worker/.env.example).");
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/rest/v1/jobs`;
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

// ---- validação do schema ---------------------------------------------------
const responseSchema = JSON.parse(
  await readFile(path.join(PROJECT_ROOT, "schemas", "post-response.schema.json"), "utf8")
);
const ajv = new Ajv({ allErrors: true, strict: false });
const validateResponse = ajv.compile(responseSchema);

// ---- acesso à fila ---------------------------------------------------------
async function claimNextJob() {
  const res = await fetch(
    `${BASE}?status=eq.pending&order=created_at.asc&limit=1&select=*`,
    { headers }
  );
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) return null;
  const job = list[0];

  // Reivindica de forma atômica: só atualiza se ainda estiver 'pending'.
  const claim = await fetch(`${BASE}?id=eq.${job.id}&status=eq.pending`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ status: "processing", started_at: new Date().toISOString() }),
  });
  const claimed = await claim.json();
  if (!Array.isArray(claimed) || claimed.length === 0) return null; // outro worker pegou
  return claimed[0];
}

async function finishJob(id, response) {
  await fetch(`${BASE}?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "done", response, finished_at: new Date().toISOString() }),
  });
}

async function failJob(id, message) {
  await fetch(`${BASE}?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "error", error: message, finished_at: new Date().toISOString() }),
  });
}

// ---- processamento de um job ----------------------------------------------
async function processJob(job) {
  console.log(`\n[job ${job.id}] ${job.format} — processando${MOCK ? " (mock)" : ""}`);
  try {
    const response = MOCK
      ? runMockPipeline(job.request, job.inputs?.tipo)
      : await runPipeline(job.request, (m) => console.log(m));
    if (GENERATE_IMAGES) {
      const n = await attachImages(response, {
        fnUrl: IMAGE_FN_URL,
        key: KEY,
        log: (m) => console.log(m),
      });
      console.log(`[job ${job.id}] imagens geradas: ${n}/${response.image_prompts?.length ?? 0}`);
    }
    if (!validateResponse(response)) {
      const errs = ajv.errorsText(validateResponse.errors, { separator: "; " });
      throw new Error(`Resposta inválida contra o schema: ${errs}`);
    }
    await finishJob(job.id, response);
    console.log(`[job ${job.id}] done — status=${response.status}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[job ${job.id}] erro: ${msg}`);
    await failJob(job.id, msg);
  }
}

// ---- geração de prompt sob demanda ----------------------------------------
// Gera o prompt de UMA peça (box) via Claude, lendo os arquivos de contexto
// (design_system.md, brand_bible.md). Muta `ip` (image_prompt).
async function generatePromptFor(response, ip) {
  const slides = Array.isArray(response.slides) ? response.slides : [];
  const m = /^slide:(\d+)$/.exec(ip.target);
  const slide = m ? slides.find((s) => String(s.index) === m[1]) : slides[0];
  const userPrompt = [
    "Você é o image-prompt-writer. Leia os arquivos design_system.md e brand_bible.md (na raiz do projeto) e gere UM prompt de imagem em português do Brasil para a peça abaixo.",
    `Marca: ${response.brand}. Formato: ${response.format} (aspecto: ${ip.aspect}).`,
    `Template visual desejado: "${ip.template ?? ""}".`,
    slide
      ? `Conteúdo da peça: título "${slide.title}", texto "${slide.body ?? ""}".`
      : `Tema da peça: ${response.theme}.`,
    `Tema do post: ${response.theme}. Ângulo: ${response.angle}.`,
    "Regras: respeite a paleta, a tipografia, o estilo de imagem e a safe area do design system; alinhe ao template visual indicado; NÃO embuta texto na imagem (o texto é renderizado por cima); ponto focal claro; coerente com a marca.",
    'Responda APENAS com um objeto JSON: {"prompt": "<descrição visual rica em português>", "negative": "<o que evitar>"}',
  ].join("\n");
  const out = await runClaudeJson(userPrompt, { allowedTools: ["Read"], label: `prompt ${ip.target}` });
  ip.prompt = String(out.prompt ?? "").trim();
  if (out.negative) ip.negative = String(out.negative).trim();
  ip.prompt_status = ip.prompt ? "done" : "error";
}

// Varre jobs 'done' com boxes em prompt_status='requested' e gera os prompts.
async function processPromptRequests() {
  const res = await fetch(
    `${BASE}?status=eq.done&order=finished_at.desc&limit=50&select=id,response`,
    { headers }
  );
  const jobs = await res.json();
  if (!Array.isArray(jobs)) return 0;
  let processed = 0;
  for (const job of jobs) {
    const resp = job.response;
    if (!resp || !Array.isArray(resp.image_prompts)) continue;
    const pending = resp.image_prompts.filter((ip) => ip.prompt_status === "requested");
    if (!pending.length) continue;
    console.log(`\n[job ${job.id}] gerando ${pending.length} prompt(s)…`);
    for (const ip of pending) {
      try {
        if (MOCK) {
          ip.prompt = `Imagem ${ip.aspect} no estilo "${ip.template}" para ${ip.target} (mock).`;
          ip.prompt_status = "done";
        } else {
          await generatePromptFor(resp, ip);
        }
        console.log(`  ✓ ${ip.target} (${ip.prompt_status})`);
      } catch (e) {
        ip.prompt_status = "error";
        console.error(`  ✗ ${ip.target}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await fetch(`${BASE}?id=eq.${job.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ response: resp }),
    });
    processed++;
  }
  return processed;
}

// ---- loop principal --------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(
    `Worker iniciado. Fila: ${BASE}. Intervalo: ${POLL_INTERVAL_MS}ms.` +
      (ONCE ? " (modo --once)" : "") +
      (GENERATE_IMAGES ? ` | imagens: ON (${IMAGE_FN_URL})` : " | imagens: OFF")
  );
  do {
    const job = await claimNextJob();
    if (job) {
      await processJob(job);
      if (ONCE) break;
      continue;
    }
    // sem job pending → atende requisições de prompt (sob demanda)
    const filled = await processPromptRequests();
    if (filled) {
      if (ONCE) break;
      continue;
    }
    if (ONCE) {
      console.log("Nada pendente (jobs ou prompts).");
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  } while (true);
}

main().catch((e) => {
  console.error("Falha fatal do worker:", e);
  process.exit(1);
});
