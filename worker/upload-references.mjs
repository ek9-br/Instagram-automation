// Sobe imagens de uma pasta local para um bucket do Supabase Storage (service role).
//
// Uso:
//   node upload-references.mjs <pasta> [bucket] [prefixo]
// Ex.:
//   node upload-references.mjs ~/Desktop/refs                       # → reference-images (Assets)
//   node upload-references.mjs ~/Desktop/criativos generated-images library   # → Geradas

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./engine.mjs";

await loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.argv[3] || "reference-images";
const PREFIX = (process.argv[4] || "").replace(/^\/+|\/+$/g, ""); // sem barras nas pontas

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

const dir = process.argv[2];
if (!dir) {
  console.error("Uso: node upload-references.mjs <pasta>");
  process.exit(1);
}
if (!SUPABASE_URL || !KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no worker/.env");
  process.exit(1);
}

// nome de objeto seguro: sem acentos, espaços viram hífen.
function safeName(f) {
  return f
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}

// Varre a pasta recursivamente e devolve os caminhos relativos das imagens.
async function walk(root, rel = "") {
  const out = [];
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // ignora .DS_Store etc.
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(root, childRel)));
    else if (MIME[path.extname(e.name).toLowerCase()]) out.push(childRel);
  }
  return out;
}

const files = await walk(dir);
if (files.length === 0) {
  console.error(`Nenhuma imagem (${Object.keys(MIME).join(", ")}) em ${dir}`);
  process.exit(1);
}

console.log(`${files.length} imagem(ns) encontrada(s) em ${dir}\n`);
let ok = 0;
for (const rel of files) {
  const ct = MIME[path.extname(rel).toLowerCase()];
  // achata a estrutura: subpasta vira prefixo no nome (categoria preservada).
  const name = safeName(rel.replaceAll("/", "__"));
  const objectPath = PREFIX ? `${encodeURIComponent(PREFIX)}/${encodeURIComponent(name)}` : encodeURIComponent(name);
  const body = await readFile(path.join(dir, rel));
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": ct, "x-upsert": "true" },
    body,
  });
  if (res.ok) {
    ok++;
    console.log(`  ✓ ${rel} → ${PREFIX ? PREFIX + "/" : ""}${name}`);
  } else {
    console.log(`  ✗ ${rel}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  }
}
console.log(`\nConcluído: ${ok}/${files.length} subida(s) para "${BUCKET}${PREFIX ? "/" + PREFIX : ""}".`);
console.log("Recarregue o app para vê-las no banco de imagens.");
