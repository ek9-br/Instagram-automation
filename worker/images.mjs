// Geração de imagens: chama a edge function `generate-image` para cada
// image_prompt e anexa a URL pública (e o path no Storage) ao próprio prompt.

// URL padrão da function a partir da base do projeto Supabase.
export const DEFAULT_FN = (base) =>
  `${String(base).replace(/\/$/, "")}/functions/v1/generate-image`;

// Gera uma imagem a partir de um prompt. Devolve { url, path, model, size }.
export async function generateImage({ prompt, aspect }, { url, key, timeoutMs = 120_000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      // `references` da response são descrições textuais, não URLs — não as
      // repassamos como imagens de referência (a function tentaria baixá-las).
      body: JSON.stringify({ prompt, aspect, references: [] }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    if (!data?.url) throw new Error("function não retornou url");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Anexa image_url/image_path a cada item de response.image_prompts (in-place).
// Sequencial para não estourar rate limit da OpenAI. Falhas não abortam o job:
// o prompt fica sem image_url e o erro é logado. Devolve quantas geraram com sucesso.
export async function attachImages(response, { fnUrl, key, log = () => {} }) {
  const prompts = response.image_prompts ?? [];
  let ok = 0;
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    try {
      log(`  🖼  imagem ${i + 1}/${prompts.length} (${p.target})...`);
      const out = await generateImage({ prompt: p.prompt, aspect: p.aspect }, { url: fnUrl, key });
      p.image_url = out.url;
      if (out.path) p.image_path = out.path;
      ok++;
    } catch (e) {
      log(`  ⚠ imagem ${i + 1} (${p.target}) falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ok;
}
