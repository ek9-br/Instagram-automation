// Edge Function: create-job
// Recebe os campos selecionados no front, resolve os labels das tabelas de
// lookup, MONTA o post-request (briefing) e ENFILEIRA o job na tabela `jobs`
// com status 'pending'. O worker local fará o polling e executará os agentes.
//
// Não chama OpenAI nem roda os agentes — isso é responsabilidade do worker local.

import { createClient } from "jsr:@supabase/supabase-js@2";

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

// tipo do front  →  format do contrato (post-request.schema.json)
const FORMAT_BY_TIPO: Record<string, string> = {
  post: "post_feed_3x4",
  carrossel: "carousel_3x4",
  criativo: "ads_landscape_1_91_1",
};

const OBJECTIVES = ["awareness", "engagement", "conversion", "education", "retention"];

interface CreateJobBody {
  tipo: string; // post | carrossel | criativo
  tema: string;
  brand?: string;
  audience?: string;
  objective?: string;
  slides_count?: number;
  // ids das tabelas de lookup (selects do front)
  sentimento_ids?: string[];
  angulo_id?: string | null;
  cta_id?: string | null;
  legenda_id?: string | null;
  template_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const body = (await req.json()) as CreateJobBody;

    const tipo = (body.tipo ?? "").trim();
    const tema = (body.tema ?? "").trim();
    if (!tema) return json({ error: "tema é obrigatório" }, 400);

    const format = FORMAT_BY_TIPO[tipo];
    if (!format) {
      return json({ error: `tipo inválido: ${tipo} (use post | carrossel | criativo)` }, 400);
    }

    const brand = (body.brand ?? "Acme").trim();
    const audience = (body.audience ?? "Persona padrão").trim();
    const objective = OBJECTIVES.includes(body.objective ?? "")
      ? (body.objective as string)
      : "engagement";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve os labels dos selects a partir dos ids.
    async function labelById(table: string, id?: string | null): Promise<string | null> {
      if (!id) return null;
      const { data } = await supabase.from(table).select("label").eq("id", id).maybeSingle();
      return data?.label ?? null;
    }
    // Resolve vários labels (multi-select), preservando a ordem dos ids.
    async function labelsByIds(table: string, ids?: string[]): Promise<string[]> {
      if (!ids || !ids.length) return [];
      const { data } = await supabase.from(table).select("id,label").in("id", ids);
      const byId = new Map((data ?? []).map((r: { id: string; label: string }) => [r.id, r.label]));
      return ids.map((id) => byId.get(id)).filter((l): l is string => !!l);
    }

    const [sentimentos, angulo, cta, legenda, template] = await Promise.all([
      labelsByIds("sentimentos", body.sentimento_ids),
      labelById("angulos", body.angulo_id),
      labelById("ctas", body.cta_id),
      labelById("legendas", body.legenda_id),
      labelById("templates", body.template_id),
    ]);

    // Monta o briefing a partir do tema + diretrizes dos selects.
    const parts: string[] = [tema.endsWith(".") ? tema : `${tema}.`];
    if (sentimentos.length)
      parts.push(
        `${sentimentos.length > 1 ? "Sentimentos/tons desejados" : "Sentimento/tom desejado"}: ${sentimentos.join(", ")}.`
      );
    if (angulo) parts.push(`Ângulo de abordagem: ${angulo}.`);
    if (template) parts.push(`Estilo de template visual: ${template}.`);
    if (legenda) parts.push(`Estilo de legenda: ${legenda}.`);
    if (cta) parts.push(`CTA preferido: ${cta}.`);
    if (tipo === "carrossel" && body.slides_count) {
      parts.push(`Formato carrossel com ${body.slides_count} slides.`);
    }
    const briefing = parts.join(" ");

    // post-request (conforme schemas/post-request.schema.json)
    const job_id = crypto.randomUUID();
    const request = { job_id, brand, format, briefing, objective, audience };

    const { error: insErr } = await supabase.from("jobs").insert({
      id: job_id,
      status: "pending",
      brand,
      format,
      inputs: body,
      request,
    });
    if (insErr) throw insErr;

    return json({ job_id, status: "pending", request }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
