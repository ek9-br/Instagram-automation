import { useEffect, useState } from "react";
import {
  APPROVAL_LABELS,
  APPROVER_EMAIL,
  fetchJob,
  applySafeGuard,
  finalizeJob,
  generateImageFromPrompt,
  JOB_STATUS_LABELS,
  SAFE_GUARD_FORMATS,
  saveJobContent,
  setApproval,
  type JobRow,
  type JobStatus,
  type PostResponse,
} from "../data/jobs";
import { addImage, imagesByIds } from "../data/imageBank";
import ReferenceImages from "./ReferenceImages";
import { useAuth } from "../auth/AuthContext";

const STEPS: JobStatus[] = ["pending", "processing", "done"];

// Prompt usado ao reenviar o safe guard à OpenAI para naturalizar o fundo preto.
const BG_REPLACE_PROMPT =
  "Substitua o fundo preto desta imagem por uma extensão natural e contínua do próprio cenário/fundo da imagem, preenchendo todas as bordas pretas até as extremidades. Mantenha o conteúdo central (produto, pessoas, textos) exatamente na mesma posição e tamanho, sem mover, cortar ou cobrir. Resultado fotográfico, coeso e natural, pronto para anúncio.";

function StatusTimeline({ status }: { status: JobStatus }) {
  const currentIdx = STEPS.indexOf(status);
  return (
    <div className="timeline">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`timeline-step ${i <= currentIdx ? "active" : ""} ${
            i === currentIdx ? "current" : ""
          }`}
        >
          <span className="timeline-dot" />
          <span>{JOB_STATUS_LABELS[s]}</span>
        </div>
      ))}
    </div>
  );
}

function CommentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="comment-field">
      <span className="comment-icon">💬</span>
      <textarea
        rows={1}
        placeholder="Comentário…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function JobResult({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const isApprover = user?.email === APPROVER_EMAIL;

  const [job, setJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);

  // aprovação
  const [notes, setNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // geração de imagens (uma por prompt) / finalização
  const [imgByIdx, setImgByIdx] = useState<Record<number, string>>({});
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [errByIdx, setErrByIdx] = useState<Record<number, string>>({});
  const [refsByIdx, setRefsByIdx] = useState<Record<number, string[]>>({});
  const [sgByIdx, setSgByIdx] = useState<Record<number, string>>({});
  const [natByIdx, setNatByIdx] = useState<Record<number, string>>({});
  const [sgBusy, setSgBusy] = useState(false);
  const [sgError, setSgError] = useState<string | null>(null);
  const [finalBusy, setFinalBusy] = useState(false);

  // edição do conteúdo gerado
  const [draft, setDraft] = useState<PostResponse | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const j = await fetchJob(jobId);
    setJob(j);
    setNotes(j?.approval_notes ?? "");
  }

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const j = await fetchJob(jobId);
        if (!active) return;
        setJob(j);
        setNotes((n) => (n === "" ? j?.approval_notes ?? "" : n));
        setLoading(false);
        if (j && (j.status === "done" || j.status === "error")) return;
      } catch {
        if (active) setLoading(false);
      }
      timer = setTimeout(tick, 3000);
    }
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  // inicializa o rascunho editável quando o job conclui
  useEffect(() => {
    if (!draft && job?.status === "done" && job.response) {
      setDraft(structuredClone(job.response));
      setComments(job.comments ?? {});
    }
  }, [job, draft]);

  function patchComment(key: string, value: string) {
    setComments((c) => ({ ...c, [key]: value }));
    setDirty(true);
  }

  function patchDraft(changes: Partial<PostResponse>) {
    setDraft((d) => (d ? { ...d, ...changes } : d));
    setDirty(true);
  }
  function patchSlide(i: number, changes: Partial<PostResponse["slides"][number]>) {
    setDraft((d) =>
      d ? { ...d, slides: d.slides.map((s, idx) => (idx === i ? { ...s, ...changes } : s)) } : d
    );
    setDirty(true);
  }
  function patchPrompt(i: number, changes: Partial<PostResponse["image_prompts"][number]>) {
    setDraft((d) =>
      d
        ? { ...d, image_prompts: d.image_prompts.map((p, idx) => (idx === i ? { ...p, ...changes } : p)) }
        : d
    );
    setDirty(true);
  }
  async function salvar() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveJobContent(jobId, draft, comments);
      setDirty(false);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function aprovar(approval: "approved" | "changes_requested") {
    if (approval === "changes_requested" && !notes.trim()) {
      setApprovalError("Descreva a alteração no campo de observações.");
      return;
    }
    setApprovalError(null);
    setApproving(true);
    try {
      await setApproval(jobId, approval, notes.trim());
      await reload();
    } catch (e) {
      setApprovalError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  }

  async function gerarImagem(idx: number, prompt: string, aspect: string) {
    if (!draft) return;
    setBusyIdx(idx);
    setErrByIdx((e) => ({ ...e, [idx]: "" }));
    try {
      // imagens de referência selecionadas → URLs enviadas junto ao prompt
      const references = imagesByIds(refsByIdx[idx] ?? []).map((b) => b.url);
      const { url } = await generateImageFromPrompt(prompt, aspect, references);
      addImage(url, `${draft.theme} · imagem ${idx + 1}`, "gerada");
      setImgByIdx((m) => ({ ...m, [idx]: url }));
    } catch (e) {
      setErrByIdx((m) => ({ ...m, [idx]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusyIdx(null);
    }
  }

  async function aplicarSafeGuards() {
    if (!draft) return;
    setSgError(null);
    setSgBusy(true);
    try {
      for (let i = 0; i < draft.image_prompts.length; i++) {
        const p = draft.image_prompts[i];
        const src = imgByIdx[i];
        const fid = p.target.startsWith("format:") ? p.target.slice("format:".length) : null;
        if (!src || !fid || !SAFE_GUARD_FORMATS.has(fid)) continue;

        // 1) safe guard (miolo redimensionado sobre fundo preto)
        const { url: sgUrl } = await applySafeGuard(src, fid);
        addImage(sgUrl, `${draft.theme} · SafeGuard ${p.label ?? fid}`, "gerada");
        setSgByIdx((m) => ({ ...m, [i]: sgUrl }));

        // 2) reenvia o safe guard à OpenAI (auto-selecionado) para trocar o
        //    fundo preto por uma extensão natural do fundo da imagem.
        const { url: natUrl } = await generateImageFromPrompt(BG_REPLACE_PROMPT, p.aspect, [sgUrl]);
        addImage(natUrl, `${draft.theme} · SafeGuard natural ${p.label ?? fid}`, "gerada");
        setNatByIdx((m) => ({ ...m, [i]: natUrl }));
      }
    } catch (e) {
      setSgError(e instanceof Error ? e.message : String(e));
    } finally {
      setSgBusy(false);
    }
  }

  async function finalizar() {
    setFinalBusy(true);
    try {
      await finalizeJob(jobId);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalBusy(false);
    }
  }

  if (loading) return <p className="muted">Carregando job…</p>;
  if (!job) return <p className="error-banner">Job não encontrado.</p>;

  const isError = job.status === "error";
  const approved = job.approval === "approved";

  return (
    <div className="job-result">
      {!isError ? (
        <StatusTimeline status={job.status} />
      ) : (
        <span className="status status-job-error">Erro</span>
      )}

      {isError && <p className="error-banner">{job.error ?? "Falha ao processar o job."}</p>}

      {!isError && job.status !== "done" && (
        <p className="muted">O worker está gerando o conteúdo… esta tela atualiza sozinha.</p>
      )}

      {draft && job.status === "done" && (
        <div className="response">
          {dirty && (
            <div className="save-bar">
              <span className="muted small">Alterações não salvas</span>
              <button className="btn primary small" disabled={saving} onClick={() => void salvar()}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          )}

          {/* Estratégia: somente leitura — a IA já decidiu, editar aqui não tem efeito. */}
          <section className="resp-block">
            <h2>Estratégia <span className="muted small">(referência)</span></h2>
            <dl className="resp-grid">
              <dt>Tema</dt><dd>{draft.theme}</dd>
              <dt>Ângulo</dt><dd>{draft.angle}</dd>
              <dt>Promessa</dt><dd>{draft.promise}</dd>
              <dt>Público</dt><dd>{draft.target_audience}</dd>
              <dt>Template</dt><dd>{draft.selected_template}</dd>
              <dt>Formato</dt><dd>{draft.format}</dd>
            </dl>
          </section>

          {/* Após a geração, é uma legenda única (CTA já embutido). */}
          <section className="resp-block">
            <h2>Legenda</h2>
            <label className="field">
              <textarea
                rows={6}
                value={draft.caption}
                onChange={(e) => patchDraft({ caption: e.target.value })}
              />
            </label>
            <CommentField
              value={comments["caption"] ?? ""}
              onChange={(v) => patchComment("caption", v)}
            />
          </section>

          {/* Cada slide é um texto bruto editável. */}
          <section className="resp-block">
            <h2>Slides ({draft.slides.length})</h2>
            <div className="slides-edit">
              {draft.slides.map((s, i) => (
                <div className="slide-edit" key={i}>
                  <span className="slide-role">Slide {s.index}</span>
                  <label className="field">
                    <textarea
                      rows={4}
                      value={[s.title, s.body].filter(Boolean).join("\n")}
                      onChange={(e) => patchSlide(i, { title: e.target.value, body: "" })}
                    />
                  </label>
                  <CommentField
                    value={comments[`slide:${i}`] ?? ""}
                    onChange={(v) => patchComment(`slide:${i}`, v)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="resp-block">
            <h2>Prompts de imagem ({draft.image_prompts.length})</h2>
            {!approved && (
              <p className="muted small">🔒 Gerar imagem fica disponível após a aprovação.</p>
            )}
            <ul className="resp-prompts">
              {draft.image_prompts.map((p, i) => (
                <li key={i}>
                  <div className="prompt-head">
                    <strong>{p.label ?? p.target}</strong>
                    <span className="chip">{p.aspect}</span>
                  </div>
                  <label className="field">
                    <span>Prompt</span>
                    <textarea
                      rows={3}
                      value={p.prompt}
                      onChange={(e) => patchPrompt(i, { prompt: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Negativo</span>
                    <input
                      value={p.negative ?? ""}
                      onChange={(e) => patchPrompt(i, { negative: e.target.value })}
                    />
                  </label>
                  <CommentField
                    value={comments[`prompt:${i}`] ?? ""}
                    onChange={(v) => patchComment(`prompt:${i}`, v)}
                  />
                  <ReferenceImages
                    selectedIds={refsByIdx[i] ?? []}
                    onChange={(ids) => setRefsByIdx((m) => ({ ...m, [i]: ids }))}
                  />
                  <div className="prompt-gen">
                    <button
                      className="btn primary small"
                      disabled={!approved || busyIdx !== null}
                      onClick={() => void gerarImagem(i, p.prompt, p.aspect)}
                    >
                      {busyIdx === i
                        ? "Gerando…"
                        : imgByIdx[i]
                          ? "Gerar nova versão"
                          : "Gerar imagem"}
                    </button>
                    {imgByIdx[i] && (
                      <img className="prompt-thumb" src={imgByIdx[i]} alt={`Imagem ${i + 1}`} />
                    )}
                    {sgByIdx[i] && (
                      <figure className="sg-thumb">
                        <img src={sgByIdx[i]} alt={`Safe guard ${i + 1}`} />
                        <figcaption>safe guard</figcaption>
                      </figure>
                    )}
                    {natByIdx[i] && (
                      <figure className="sg-thumb">
                        <img src={natByIdx[i]} alt={`Safe guard natural ${i + 1}`} />
                        <figcaption>natural</figcaption>
                      </figure>
                    )}
                  </div>
                  {errByIdx[i] && <p className="error-banner">{errByIdx[i]}</p>}
                </li>
              ))}
            </ul>

            {draft.image_prompts.some((p) => p.target.startsWith("format:")) &&
              Object.keys(imgByIdx).length > 0 && (
                <div className="safeguard-bar">
                  <button
                    className="btn primary"
                    disabled={sgBusy}
                    onClick={() => void aplicarSafeGuards()}
                  >
                    {sgBusy ? "Aplicando…" : "Aplicar Safe Guards"}
                  </button>
                  <span className="muted small">
                    Redimensiona com fundo preto (1:1 → 1080×1080, 3:4 → 1080×1440, 9:16 →
                    1080×1920), depois reenvia à OpenAI para trocar o preto por um fundo natural —
                    tudo salvo na biblioteca.
                  </span>
                  {sgError && <p className="error-banner">{sgError}</p>}
                </div>
              )}

            <p className="muted small">
              Safe area — topo {draft.safe_area.top_pct}% · base {draft.safe_area.bottom_pct}% ·
              laterais {draft.safe_area.side_pct}%
            </p>
          </section>

          <section className="resp-block">
            <h2>
              Review <span className="muted small">(score {draft.review.score})</span>
            </h2>
            <div className="resp-checks">
              {Object.entries(draft.review.checks).map(([k, v]) => (
                <span key={k} className={`check ${v ? "ok" : "fail"}`}>
                  {v ? "✓" : "✕"} {k}
                </span>
              ))}
            </div>
            {draft.review.issues.length > 0 && (
              <>
                <h3>Issues</h3>
                <ul>{draft.review.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
            {draft.review.suggestions.length > 0 && (
              <>
                <h3>Sugestões</h3>
                <ul>{draft.review.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
          </section>

          {/* ---- Aprovação ---- */}
          <section className="resp-block approval">
            <h2>
              Aprovação{" "}
              <span className={`status approval-${job.approval}`}>
                {APPROVAL_LABELS[job.approval]}
              </span>
            </h2>
            {job.approved_by && (
              <p className="muted small">
                Aprovado por {job.approved_by}
                {job.approved_at ? ` em ${new Date(job.approved_at).toLocaleString("pt-BR")}` : ""}
              </p>
            )}

            {isApprover ? (
              <>
                <label className="field">
                  <span>Observações (preencha ao solicitar alterações)</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex.: trocar o gancho do slide 1, suavizar o CTA…"
                  />
                </label>
                {approvalError && <p className="error-banner">{approvalError}</p>}
                <div className="approval-actions">
                  <button
                    className="btn primary"
                    disabled={approving || approved}
                    onClick={() => void aprovar("approved")}
                  >
                    {approved ? "Aprovado" : "Aprovar"}
                  </button>
                  <button
                    className="btn"
                    disabled={approving}
                    onClick={() => void aprovar("changes_requested")}
                  >
                    Solicitar alterações
                  </button>
                </div>
              </>
            ) : (
              <>
                {job.approval_notes && (
                  <p className="obs-box">
                    <strong>Observações:</strong> {job.approval_notes}
                  </p>
                )}
                <p className="muted small">Somente {APPROVER_EMAIL} pode aprovar.</p>
              </>
            )}
          </section>

          {/* ---- Ações (bloqueadas até aprovação) ---- */}
          <section className="resp-block">
            <h2>Ações</h2>
            {!approved && (
              <p className="muted small">🔒 Finalizar fica disponível somente após a aprovação.</p>
            )}
            <div className="approval-actions">
              <button
                className="btn"
                disabled={!approved || finalBusy || !!job.finalized_at}
                onClick={() => void finalizar()}
              >
                {job.finalized_at ? "Finalizado" : finalBusy ? "Finalizando…" : "Finalizar post"}
              </button>
            </div>
            {job.finalized_at && (
              <p className="muted small">
                Finalizado em {new Date(job.finalized_at).toLocaleString("pt-BR")}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
