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

// ---- loop principal --------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(
    `Worker iniciado. Fila: ${BASE}. Intervalo: ${POLL_INTERVAL_MS}ms.` +
      (ONCE ? " (modo --once)" : "")
  );
  do {
    const job = await claimNextJob();
    if (job) {
      await processJob(job);
      if (ONCE) break;
    } else {
      if (ONCE) {
        console.log("Nenhum job pending.");
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } while (true);
}

main().catch((e) => {
  console.error("Falha fatal do worker:", e);
  process.exit(1);
});
