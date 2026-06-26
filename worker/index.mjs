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
import { attachImages, generateImage, DEFAULT_FN } from "./images.mjs";

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
// slug do label → nome de arquivo (igual à convenção em visual/README.md).
function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
async function readMd(rel) {
  try {
    return (await readFile(path.join(PROJECT_ROOT, rel), "utf8")).trim();
  } catch {
    return "";
  }
}

// Gera o prompt de UMA peça (box) via Claude, lendo os arquivos de contexto
// (design_system.md, brand_bible.md) + as regras do template e do estilo escolhidos
// (visual/templates/*.md, visual/estilos/*.md). Muta `ip` (image_prompt).
async function generatePromptFor(response, ip, { revision } = {}) {
  const slides = Array.isArray(response.slides) ? response.slides : [];
  const m = /^slide:(\d+)$/.exec(ip.target);
  const slide = (m ? slides.find((s) => String(s.index) === m[1]) : slides[0]) || slides[0];
  const tmplMd = ip.template ? await readMd(`visual/templates/${slugify(ip.template)}.md`) : "";
  const estiloMd = ip.estilo ? await readMd(`visual/estilos/${slugify(ip.estilo)}.md`) : "";
  // Texto que DEVE aparecer renderizado na imagem (copy da peça).
  const textoImagem = slide ? [slide.title, slide.body].filter(Boolean).join("\n") : "";
  const userPrompt = [
    "Você é o image-prompt-writer. Leia os arquivos design_system.md e brand_bible.md (na raiz do projeto) e gere UM prompt de imagem em português do Brasil para a peça abaixo.",
    `Marca: ${response.brand}. Formato: ${response.format} (aspecto: ${ip.aspect}).`,
    `Template visual: "${ip.template ?? ""}". Estilo visual: "${ip.estilo ?? ""}".`,
    tmplMd && `\nREGRAS DO TEMPLATE (layout — disposição de texto/imagem/botões; siga à risca):\n${tmplMd}`,
    estiloMd && `\nREGRAS DO ESTILO (fonte, tamanho/cores de texto, cores de fundo, sombra, transparências; siga à risca):\n${estiloMd}`,
    textoImagem
      ? `\nTEXTO QUE DEVE APARECER NA IMAGEM (renderizado na arte, EXATAMENTE como abaixo — não invente, não traduza, não acrescente):\n"""\n${textoImagem}\n"""`
      : `\nTema da peça: ${response.theme}.`,
    `Tema do post: ${response.theme}. Ângulo: ${response.angle}.`,
    revision &&
      `\nCOMENTÁRIO DE REVISÃO DO HUMANO (prioritário — ajuste o prompt para atender):\n"""\n${revision}\n"""`,
    "Regras gerais: o prompt DEVE instruir a IA de imagem a RENDERIZAR o texto acima DENTRO da imagem (o texto faz parte da arte), posicionado conforme o LAYOUT do template e com a tipografia/cores do ESTILO. Use exatamente o texto fornecido — sem inventar, traduzir ou acrescentar palavras. Respeite design_system/brand_bible (paleta, tipografia, safe area); ponto focal claro; coerente com a marca.",
    'Se o template for "Livre" (ou não definir layout), NÃO imponha estrutura própria: o prompt deve instruir a IA a seguir FIELMENTE o layout/composição/estilo da IMAGEM DE REFERÊNCIA anexada, apenas encaixando o texto fornecido de forma coerente.',
    "BOTÃO/CTA é OPCIONAL: NÃO desenhe nenhum botão (ex.: \"Teste grátis\") a menos que haja um texto de CTA explícito na copy acima. Se não houver texto de CTA, a peça NÃO deve ter botão algum.",
    'Responda APENAS com um objeto JSON: {"prompt": "<descrição visual rica em português, dizendo qual texto renderizar e onde>", "negative": "<o que evitar, ex.: texto cortado, erros de ortografia, palavras trocadas>"}',
  ]
    .filter(Boolean)
    .join("\n");
  const out = await runClaudeJson(userPrompt, { allowedTools: ["Read"], label: `prompt ${ip.target}` });
  let prompt = String(out.prompt ?? "").trim();
  // Garante DETERMINISTICAMENTE que o texto planejado esteja no prompt da imagem
  // (não depende de a Claude tê-lo ecoado). Acrescenta o bloco verbatim no fim.
  if (textoImagem && prompt) {
    const jaContem = textoImagem
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .every((l) => prompt.includes(l));
    if (!jaContem) {
      prompt +=
        `\n\nTEXTO A RENDERIZAR NA IMAGEM (reproduza EXATAMENTE, sem alterar, traduzir, ` +
        `abreviar ou trocar palavras; respeite as quebras de linha):\n${textoImagem}`;
    }
  }
  ip.prompt = prompt;
  if (out.negative) ip.negative = String(out.negative).trim();
  ip.prompt_status = ip.prompt ? "done" : "error";
}

// Resumo legível do que a revisão "aprendeu" (regras de template/estilo).
function summarizeLearned(l) {
  const parts = [];
  if (l.templateUpdated) parts.push("template");
  if (l.estiloUpdated) parts.push("estilo");
  const head = parts.length
    ? `Regras atualizadas: ${parts.join(" + ")}.`
    : "Nenhuma regra global alterada.";
  return l.summary ? `${head} ${l.summary}` : head;
}

// Decide se o comentário de revisão é uma REGRA DURÁVEL de template e/ou estilo e,
// se for, edita o(s) arquivo(s) MD correspondente(s) (Read + Edit). Devolve o que mudou.
async function maybeLearnFromRevision({ comment, template, estilo }) {
  if (!comment || (!template && !estilo)) {
    return { templateUpdated: false, estiloUpdated: false, summary: "" };
  }
  const tmplPath = template ? `visual/templates/${slugify(template)}.md` : "";
  const estiloPath = estilo ? `visual/estilos/${slugify(estilo)}.md` : "";
  const prompt = [
    "Você cuida da base visual da marca. TEMPLATES = disposição/layout (sem cores). ESTILOS = acabamento: cores, fonte, tamanho de texto, sombra, transparências (sem layout).",
    "Um humano revisou uma imagem gerada e escreveu o comentário abaixo:",
    `"""\n${comment}\n"""`,
    template ? `Template da peça: "${template}" → arquivo: ${tmplPath}` : "Sem template definido (não edite template).",
    estilo ? `Estilo da peça: "${estilo}" → arquivo: ${estiloPath}` : "Sem estilo definido (não edite estilo).",
    "",
    "Decida se o comentário expressa uma REGRA DURÁVEL e GENÉRICA (válida para futuras peças):",
    "- Ajuste pontual de conteúdo/texto DESTA peça → NÃO edite nada.",
    "- Regra durável de LAYOUT → edite o arquivo do template (Read + Edit), de forma concisa e coerente, sem duplicar nem contradizer o que já existe (template não leva cores).",
    "- Regra durável de ACABAMENTO (cor/fonte/tamanho/sombra/transparência) → edite o arquivo do estilo (Read + Edit) (estilo não leva disposição).",
    "Faça apenas edições pequenas e seguras. Em dúvida, NÃO edite.",
    "",
    'Responda APENAS com JSON: {"template_updated": <bool>, "estilo_updated": <bool>, "summary": "<1 frase do que mudou, ou por que não mudou>"}',
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const out = await runClaudeJson(prompt, { allowedTools: ["Read", "Edit"], label: "learn-revision" });
    return {
      templateUpdated: !!out.template_updated,
      estiloUpdated: !!out.estilo_updated,
      summary: String(out.summary ?? "").trim(),
    };
  } catch {
    return { templateUpdated: false, estiloUpdated: false, summary: "" };
  }
}

// Aplica a revisão de UMA peça (image_prompt) de um job: regera o prompt com o
// comentário, gera nova imagem e aprende eventuais regras de template/estilo.
async function applyImageRevision(resp, ip) {
  if (MOCK) {
    ip.prompt = `${ip.prompt ?? ""} [revisado: ${ip.revision}]`.trim();
    ip.prompt_status = "done";
    ip.revision_note = "mock";
    ip.revision_status = "done";
    ip.revision = "";
    return;
  }
  await generatePromptFor(resp, ip, { revision: ip.revision });
  if (ip.prompt_status !== "done") throw new Error("falha ao regerar o prompt");
  if (IMAGE_FN_URL) {
    const out = await generateImage({ prompt: ip.prompt, aspect: ip.aspect, negative: ip.negative }, { url: IMAGE_FN_URL, key: KEY });
    ip.image_url = out.url;
    if (out.path) ip.image_path = out.path;
  }
  const learned = await maybeLearnFromRevision({ comment: ip.revision, template: ip.template, estilo: ip.estilo });
  ip.revision_note = summarizeLearned(learned);
  ip.revision_status = "done";
  ip.revision = "";
}

// Varre jobs 'done' e atende: (a) boxes em prompt_status='requested' → gera prompt;
// (b) boxes em revision_status='requested' → regera prompt+imagem com o comentário.
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
    const revisions = resp.image_prompts.filter((ip) => ip.revision_status === "requested");
    if (!pending.length && !revisions.length) continue;

    if (pending.length) {
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
    }

    if (revisions.length) {
      console.log(`\n[job ${job.id}] aplicando ${revisions.length} revisão(ões)…`);
      for (const ip of revisions) {
        try {
          await applyImageRevision(resp, ip);
          console.log(`  ✓ revisão ${ip.target} → ${ip.revision_note ?? ""}`);
        } catch (e) {
          ip.revision_status = "error";
          ip.revision_note = e instanceof Error ? e.message : String(e);
          console.error(`  ✗ revisão ${ip.target}: ${ip.revision_note}`);
        }
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

// ---- revisões de criativos (tabela `creatives`, coluna data JSONB) ----------
const CREATIVES = `${SUPABASE_URL}/rest/v1/creatives`;

// Reescreve o prompt de um criativo incorporando o comentário de revisão.
async function reviseCreativePrompt(c) {
  const estiloMd = c.estilo ? await readMd(`visual/estilos/${slugify(c.estilo)}.md`) : "";
  const tmplMd = c.template ? await readMd(`visual/templates/${slugify(c.template)}.md`) : "";
  const prompt = [
    "Você é o image-prompt-writer. Leia design_system.md e brand_bible.md (na raiz) e reescreva o PROMPT de imagem abaixo incorporando o comentário de revisão do humano. Português do Brasil.",
    `Estilo visual: "${c.estilo ?? ""}".`,
    estiloMd && `\nREGRAS DO ESTILO (fonte, tamanho/cores de texto, fundo, sombra, transparências):\n${estiloMd}`,
    tmplMd && `\nREGRAS DO TEMPLATE (layout):\n${tmplMd}`,
    `\nPROMPT ATUAL:\n"""\n${c.prompt ?? ""}\n"""`,
    `\nCOMENTÁRIO DE REVISÃO (prioritário):\n"""\n${c.revision ?? ""}\n"""`,
    "Se o prompt pede texto na arte, a IA deve RENDERIZAR o texto DENTRO da imagem (faz parte da arte); use exatamente o texto fornecido, sem inventar nem traduzir. Respeite paleta/tipografia/safe area da marca.",
    'Responda APENAS com JSON: {"prompt": "<novo prompt completo em português>", "negative": "<o que evitar>"}',
  ]
    .filter(Boolean)
    .join("\n");
  const out = await runClaudeJson(prompt, { allowedTools: ["Read"], label: "revise-criativo" });
  const p = String(out.prompt ?? "").trim();
  if (!p) throw new Error("prompt vazio");
  return p;
}

// Varre criativos com revisionStatus='requested': regera prompt + imagem crua e
// aprende eventuais regras de estilo/template.
async function processCreativeRevisions() {
  const res = await fetch(`${CREATIVES}?select=id,data`, { headers });
  const rows = await res.json();
  if (!Array.isArray(rows)) return 0;
  const pending = rows.filter((r) => r?.data?.revisionStatus === "requested");
  if (!pending.length) return 0;
  let processed = 0;
  for (const row of pending) {
    const c = row.data || {};
    console.log(`\n[criativo ${row.id}] revisando…`);
    try {
      let next;
      if (MOCK) {
        next = { ...c, prompt: `${c.prompt} [revisado: ${c.revision}]`, revisionNote: "mock" };
      } else {
        const newPrompt = await reviseCreativePrompt(c);
        const learned = await maybeLearnFromRevision({
          comment: c.revision,
          template: c.template,
          estilo: c.estilo,
        });
        let rawUrl = c.rawUrl;
        if (IMAGE_FN_URL) {
          const out = await generateImage({ prompt: newPrompt, aspect: "portrait" }, { url: IMAGE_FN_URL, key: KEY });
          rawUrl = out.url;
        }
        next = { ...c, prompt: newPrompt, rawUrl, revisionNote: summarizeLearned(learned) };
      }
      next = {
        ...next,
        safezoneUrl: null,
        finalUrl: null,
        status: "idle",
        revision: "",
        revisionStatus: "done",
        error: null,
      };
      await fetch(`${CREATIVES}?id=eq.${row.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ data: next }),
      });
      processed++;
      console.log(`  ✓ criativo ${row.id} → ${next.revisionNote ?? ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await fetch(`${CREATIVES}?id=eq.${row.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ data: { ...c, status: "error", revisionStatus: "error", error: msg } }),
      });
      console.error(`  ✗ criativo ${row.id}: ${msg}`);
    }
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
    // sem job pending → atende requisições de prompt/revisão (sob demanda)
    const filled = await processPromptRequests();
    const creRev = await processCreativeRevisions();
    if (filled || creRev) {
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
