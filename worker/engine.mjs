// Motor compartilhado dos pipelines de agentes (posts e artigos).
// Encapsula: invocação do `claude` headless, leitura dos .claude/agents/*.md,
// strip de frontmatter, extração de JSON e encadeamento de estado entre estágios.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

// Carrega worker/.env para process.env (parser mínimo, sem dependência).
export async function loadEnv() {
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

// Remove o frontmatter YAML (--- ... ---) de um arquivo de agente.
export function stripFrontmatter(md) {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(md.indexOf("\n", end + 1) + 1).trim();
  }
  return md.trim();
}

// Extrai o primeiro objeto JSON de um texto (tolera prosa ao redor).
export function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Nenhum objeto JSON encontrado na saída do agente");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// Executa o binário do claude e devolve o stdout cru.
export function runClaude(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      // lido em runtime (o .env é carregado depois do import deste módulo)
      process.env.CLAUDE_BIN || "claude",
      args,
      {
        cwd: PROJECT_ROOT,
        maxBuffer: 40 * 1024 * 1024,
        timeout: opts.timeout ?? 240_000,
        // ignora stdin (evita aviso "no stdin data received") e herda o env
        stdio: ["ignore", "pipe", "pipe"],
        ...opts,
      },
      (err, stdout, stderr) => {
        // O claude pode sair com código != 0 mas ainda imprimir um JSON de
        // resultado (com is_error). Preferimos o stdout quando existir.
        if (stdout && stdout.trim()) return resolve(stdout);
        if (err) return reject(new Error(`${err.message}\n${stderr}`));
        resolve(stdout);
      }
    );
  });
}

// Monta os args base do `claude -p`. allowedTools default = ["Read"].
function claudeArgs(prompt, { allowedTools = ["Read"], system } = {}) {
  const args = ["-p", prompt, "--output-format", "json"];
  if (allowedTools && allowedTools.length) args.push("--allowedTools", ...allowedTools);
  args.push("--permission-mode", "bypassPermissions");
  if (system) args.push("--append-system-prompt", system);
  return args;
}

// Desembrulha o JSON de --output-format json e devolve o texto do resultado.
function unwrapResult(stdout, ctx) {
  let outer;
  try {
    outer = JSON.parse(stdout);
  } catch {
    throw new Error(`Saída do claude não é JSON (${ctx})`);
  }
  if (outer.is_error) throw new Error(`Claude retornou erro (${ctx}): ${outer.result}`);
  return typeof outer.result === "string" ? outer.result : JSON.stringify(outer.result);
}

// Roda um prompt livre (ex.: etapas com MCP: enricher, reader, publisher) e
// devolve o texto. Use opts.allowedTools para liberar ferramentas MCP.
export async function runClaudeText(prompt, opts = {}) {
  const stdout = await runClaude(claudeArgs(prompt, opts), { timeout: opts.timeout });
  return unwrapResult(stdout, opts.label ?? "prompt");
}

// Igual ao runClaudeText, mas extrai e devolve o objeto JSON da resposta.
export async function runClaudeJson(prompt, opts = {}) {
  return extractJson(await runClaudeText(prompt, opts));
}

// Executa um estágio-agente: lê .claude/agents/<stage>.md, monta o system prompt
// (corpo do agente + regras de saída), envia o estado atual e devolve o estado
// atualizado (JSON).
export async function runStage(stage, state, opts = {}) {
  const agentMd = await readFile(
    path.join(PROJECT_ROOT, ".claude", "agents", `${stage}.md`),
    "utf8"
  );
  const system = [
    stripFrontmatter(agentMd),
    "",
    "REGRAS DE SAÍDA (obrigatórias):",
    "- Responda APENAS com um único objeto JSON, sem markdown, sem crases, sem prosa.",
    "- Devolva o estado completo do job (todos os campos recebidos) acrescido dos seus campos.",
    ...(opts.extraRules ?? []),
  ].join("\n");

  const prompt = [
    "Estado atual do job (JSON). Aplique o seu papel e devolva o JSON completo atualizado:",
    "",
    JSON.stringify(state, null, 2),
  ].join("\n");

  const stdout = await runClaude(claudeArgs(prompt, { allowedTools: opts.allowedTools, system }), {
    timeout: opts.timeout,
  });
  return extractJson(unwrapResult(stdout, stage));
}

// Encadeia uma lista de estágios, passando o estado acumulado adiante.
export async function runStages(stages, request, opts = {}) {
  const log = opts.log ?? (() => {});
  let state = { ...request };
  for (const stage of stages) {
    log(`  → ${stage}...`);
    state = await runStage(stage, state, opts);
  }
  return state;
}
