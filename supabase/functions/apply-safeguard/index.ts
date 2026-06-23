// Edge Function: apply-safeguard
// Recebe a URL de uma imagem de criativo + o formato, redimensiona o miolo e
// compõe sobre um fundo preto do tamanho final, faz upload no Storage e devolve
// a URL da nova imagem (para ser salva na biblioteca).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const BUCKET = "generated-images";

// Canvas final (px) por formato. O miolo é encaixado preservando a PROPORÇÃO
// original (sem distorcer) dentro de INNER do canvas, centralizado; o restante
// vira margem (topo/rodapé/laterais) preenchida de preto.
const INNER = 0.85; // miolo ocupa ~85% do canvas; ~7,5%+ de margem (mais onde a proporção sobra)
const CANVAS: Record<string, { cw: number; ch: number }> = {
  feed_1_1: { cw: 1080, ch: 1080 },
  feed_3_4: { cw: 1080, ch: 1440 },
  feed_4_5: { cw: 1080, ch: 1350 },
  story_9_16: { cw: 1080, ch: 1920 },
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

    const canvas = CANVAS[format];
    if (!canvas) return json({ error: `Formato sem safe guard definido: ${format}` }, 400);
    const { cw, ch } = canvas;

    // baixa a imagem original
    const res = await fetch(url);
    if (!res.ok) throw new Error("Falha ao baixar a imagem original");
    const buf = new Uint8Array(await res.arrayBuffer());

    // Encaixa o miolo PRESERVANDO a proporção original (sem distorcer) dentro de
    // INNER do canvas, e compõe centralizado sobre fundo preto. As margens
    // (topo/rodapé/laterais) ficam pretas para a regeração preencher depois.
    const src = await Image.decode(buf);
    const scale = Math.min((cw * INNER) / src.width, (ch * INNER) / src.height);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const miolo = src.resize(w, h); // w e h pelo mesmo fator → mantém o aspecto
    const bg = new Image(cw, ch);
    bg.fill(0x000000ff); // preto opaco (RGBA)
    bg.composite(miolo, Math.round((cw - w) / 2), Math.round((ch - h) / 2));
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
    return json({ url: pub.publicUrl, format, size: `${cw}x${ch}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
