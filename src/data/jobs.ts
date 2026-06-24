import { supabase } from "../lib/supabase";

// Payload enviado à edge function create-job (selects do front).
export interface CreateJobPayload {
  tipo: string; // post | carrossel | criativo
  tema: string;
  slides_count?: number;
  sentimento_ids: string[];
  angulo_id: string | null;
  cta_id: string | null;
  legenda_id: string | null;
}

export interface CreateJobResult {
  job_id: string;
  status: string;
  request: unknown;
}

// Chama a edge function que monta o post-request e enfileira o job.
export async function createJob(payload: CreateJobPayload): Promise<CreateJobResult> {
  const { data, error } = await supabase.functions.invoke("create-job", { body: payload });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as CreateJobResult;
}

export type JobStatus = "pending" | "processing" | "done" | "error";

// Único usuário autorizado a aprovar / solicitar alterações.
export const APPROVER_EMAIL = "eduardo.canova@coalize.com.br";

export type Approval = "pending" | "approved" | "changes_requested";

export const APPROVAL_LABELS: Record<Approval, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  changes_requested: "Alterações solicitadas",
};

// Estrutura do post-response (schemas/post-response.schema.json) para renderização.
export interface PostResponseSlide {
  index: number;
  role: string;
  title: string;
  body: string;
}
export interface PostResponseImagePrompt {
  target: string;
  label?: string;
  prompt: string;
  template?: string; // template visual escolhido para a peça
  estilo?: string; // estilo/paleta visual (Claro / Azul escuro / Verde Escuro)
  prompt_status?: "idle" | "requested" | "done" | "error";
  aspect: string;
  negative?: string;
  references?: string[];
  image_url?: string;
  image_path?: string;
}
export interface PostResponse {
  job_id: string;
  brand: string;
  format: string;
  theme: string;
  angle: string;
  promise: string;
  target_audience: string;
  selected_template: string;
  caption: string;
  cta: string;
  slides: PostResponseSlide[];
  image_prompts: PostResponseImagePrompt[];
  safe_area: { top_pct: number; bottom_pct: number; side_pct: number };
  review: {
    score: number;
    checks: Record<string, boolean>;
    issues: string[];
    suggestions: string[];
  };
  status: string;
}

export interface JobRow {
  id: string;
  status: JobStatus;
  response: PostResponse | null;
  error: string | null;
  approval: Approval;
  approval_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  finalized_at: string | null;
  comments: Record<string, string>;
}

// Lê o estado atual de um job na fila.
export async function fetchJob(id: string): Promise<JobRow | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id,status,response,error,approval,approval_notes,approved_by,approved_at,finalized_at,comments"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRow | null) ?? null;
}

// Aprova ou solicita alterações (com observações). Enforcement no banco garante
// que só o aprovador consegue executar.
export async function setApproval(
  id: string,
  approval: Approval,
  notes: string
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ approval, approval_notes: notes || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Salva edições no conteúdo gerado (jobs.response) e os comentários por campo.
export async function saveJobContent(
  id: string,
  response: PostResponse,
  comments: Record<string, string>
): Promise<void> {
  const { error } = await supabase.from("jobs").update({ response, comments }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Finaliza o post (só permitido se aprovado — enforcement no banco).
export async function finalizeJob(id: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ finalized_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Formatos de criativo que possuem regra de safe guard.
export const SAFE_GUARD_FORMATS = new Set(["feed_1_1", "feed_3_4", "story_9_16"]);

// Aplica o safe guard (redimensiona + fundo preto) numa imagem já gerada.
export async function applySafeGuard(url: string, format: string): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("apply-safeguard", {
    body: { url, format },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { url: string };
}

// Gera uma imagem a partir de um prompt (edge function generate-image).
export async function generateImageFromPrompt(
  prompt: string,
  aspect: string,
  references: string[] = []
): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: { prompt, aspect, references },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as { url: string };
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Na fila",
  processing: "Gerando…",
  done: "Pronto",
  error: "Erro",
};
