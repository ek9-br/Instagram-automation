// Edge Function: generate-image
// Recebe um prompt (+ imagens de referência opcionais), chama a API de imagens
// da OpenAI (gpt-image-2), salva o resultado no Storage e devolve a URL.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-2";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const BUCKET = "generated-images";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mapeia a proporção desejada para um tamanho suportado pelo gpt-image-1.
function sizeFor(aspect: string): string {
  switch (aspect) {
    case "portrait":
      return "1024x1536";
    case "landscape":
      return "1536x1024";
    default:
      return "1024x1024";
  }
}

interface RequestBody {
  prompt: string;
  aspect?: "square" | "portrait" | "landscape";
  references?: string[]; // URLs de imagens de referência
  negative?: string; // o que evitar — dobrado no prompt (a API não tem negative_prompt)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada (supabase secrets set)");

    const { prompt, aspect = "square", references = [], negative = "" } =
      (await req.json()) as RequestBody;
    if (!prompt || !prompt.trim()) return json({ error: "prompt é obrigatório" }, 400);

    // A API de imagens da OpenAI não tem negative_prompt — dobramos no prompt.
    const finalPrompt = negative && negative.trim()
      ? `${prompt}\n\nEVITE / NÃO inclua na imagem: ${negative.trim()}`
      : prompt;

    const size = sizeFor(aspect);
    let b64: string | undefined;

    if (references.length > 0) {
      // Com referências → endpoint /images/edits (multipart, aceita várias imagens).
      const form = new FormData();
      form.append("model", MODEL);
      form.append("prompt", finalPrompt);
      form.append("size", size);
      for (let i = 0; i < references.length; i++) {
        const r = await fetch(references[i]);
        if (!r.ok) throw new Error(`Falha ao baixar referência ${i + 1}`);
        const blob = await r.blob();
        form.append("image[]", blob, `ref_${i}.png`);
      }
      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Erro OpenAI (edits)");
      b64 = data?.data?.[0]?.b64_json;
    } else {
      // Sem referências → geração simples.
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, prompt: finalPrompt, size, n: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Erro OpenAI (generations)");
      b64 = data?.data?.[0]?.b64_json;
    }

    if (!b64) throw new Error("OpenAI não retornou imagem");

    // Upload no Storage (service role → ignora RLS) e devolve URL pública.
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const path = `gen/${Date.now()}_${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return json({ url: pub.publicUrl, path, model: MODEL, size });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
