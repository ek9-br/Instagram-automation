// Edge Function: apply-safeguard
// Recebe a URL de uma imagem de criativo + o formato, redimensiona o miolo e
// compõe sobre um fundo preto do tamanho final, faz upload no Storage e devolve
// a URL da nova imagem (para ser salva na biblioteca).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const BUCKET = "generated-images";

// miolo (resize) → fundo (canvas), centralizado, fundo preto.
const SPECS: Record<string, { rw: number; rh: number; cw: number; ch: number }> = {
  feed_1_1: { rw: 950, rh: 950, cw: 1080, ch: 1080 },
  feed_3_4: { rw: 1000, rh: 1150, cw: 1080, ch: 1440 },
  feed_4_5: { rw: 1000, rh: 1230, cw: 1080, ch: 1350 },
  story_9_16: { rw: 950, rh: 1920, cw: 1080, ch: 1920 },
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const { url, format } = (await req.json()) as { url: string; format: string };
    if (!url) return json({ error: "url é obrigatória" }, 400);

    const spec = SPECS[format];
    if (!spec) return json({ error: `Formato sem safe guard definido: ${format}` }, 400);

    // baixa a imagem original
    const res = await fetch(url);
    if (!res.ok) throw new Error("Falha ao baixar a imagem original");
    const buf = new Uint8Array(await res.arrayBuffer());

    // redimensiona o miolo e compõe sobre fundo preto
    let src = await Image.decode(buf);
    src = src.resize(spec.rw, spec.rh);
    const bg = new Image(spec.cw, spec.ch);
    bg.fill(0x000000ff); // preto opaco (RGBA)
    const x = Math.round((spec.cw - spec.rw) / 2);
    const y = Math.round((spec.ch - spec.rh) / 2);
    bg.composite(src, x, y);
    const out = await bg.encode(); // PNG

    // upload no Storage (service role)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const path = `safeguard/${Date.now()}_${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, out, { contentType: "image/png", upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return json({ url: pub.publicUrl, format, size: `${spec.cw}x${spec.ch}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
