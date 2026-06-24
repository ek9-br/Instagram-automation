import { useEffect, useState } from "react";
import {
  fetchJob,
  finalizeJob,
  generateImageFromPrompt,
  JOB_STATUS_LABELS,
  saveJobContent,
  type JobRow,
  type JobStatus,
  type PostResponse,
} from "../data/jobs";
import { addImage, imagesByIds } from "../data/imageBank";
import { useLookups } from "../data/lookups";
import { ESTILOS } from "../types";
import ReferenceImages from "./ReferenceImages";

const STEPS: JobStatus[] = ["pending", "processing", "done"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function CommentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="comment-field">
      <span className="comment-icon">💬</span>
      <textarea rows={1} placeholder="Comentário…" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function JobResult({ jobId }: { jobId: string }) {
  const { data: lookups } = useLookups();

  const [job, setJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);

  // geração de imagens (uma por prompt) / finalização
  const [imgByIdx, setImgByIdx] = useState<Record<number, string>>({});
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [errByIdx, setErrByIdx] = useState<Record<number, string>>({});
  const [refsByIdx, setRefsByIdx] = useState<Record<number, string[]>>({});
  const [promptBusy, setPromptBusy] = useState<Record<number, boolean>>({});
  const [finalBusy, setFinalBusy] = useState(false);

  // edição do conteúdo gerado
  const [draft, setDraft] = useState<PostResponse | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // lightbox para ampliar a imagem gerada
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  async function reload() {
    setJob(await fetchJob(jobId));
  }

  // polling do job até concluir/erro
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const j = await fetchJob(jobId);
        if (!active) return;
        setJob(j);
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

  // ---- Gerar prompt (sob demanda, via worker + Claude) ----
  // Marca o box como 'requested' (com o template escolhido), persiste no job e
  // faz polling até o worker preencher o prompt; depois mescla no draft.
  async function gerarPrompt(i: number) {
    if (!draft) return;
    const ip = draft.image_prompts[i];
    if (!ip.template || !ip.estilo) {
      alert("Selecione o template e o estilo antes de gerar o prompt.");
      return;
    }
    const requested: PostResponse = {
      ...draft,
      image_prompts: draft.image_prompts.map((p, idx) =>
        idx === i ? { ...p, prompt_status: "requested" } : p
      ),
    };
    setDraft(requested);
    setErrByIdx((m) => ({ ...m, [i]: "" }));
    setPromptBusy((b) => ({ ...b, [i]: true }));
    try {
      await saveJobContent(jobId, requested, comments);
      setDirty(false);
      // aguarda o worker preencher o prompt deste box
      for (let t = 0; t < 80; t++) {
        await sleep(3000);
        const j = await fetchJob(jobId);
        const filled = j?.response?.image_prompts?.[i];
        if (filled && filled.prompt_status === "done" && filled.prompt) {
          setDraft((d) =>
            d
              ? {
                  ...d,
                  image_prompts: d.image_prompts.map((p, idx) =>
                    idx === i
                      ? { ...p, prompt: filled.prompt, negative: filled.negative ?? p.negative, prompt_status: "done" }
                      : p
                  ),
                }
              : d
          );
          return;
        }
        if (filled && filled.prompt_status === "error") {
          setErrByIdx((m) => ({ ...m, [i]: "Falha ao gerar o prompt. Tente de novo." }));
          patchPrompt(i, { prompt_status: "error" });
          return;
        }
      }
      setErrByIdx((m) => ({ ...m, [i]: "Tempo esgotado esperando o worker. O worker local está rodando?" }));
    } catch (e) {
      setErrByIdx((m) => ({ ...m, [i]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPromptBusy((b) => ({ ...b, [i]: false }));
    }
  }

  async function gerarImagem(idx: number, prompt: string, aspect: string) {
    if (!draft) return;
    setBusyIdx(idx);
    setErrByIdx((e) => ({ ...e, [idx]: "" }));
    try {
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

  return (
    <div className="job-result">
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox} alt="Imagem gerada (ampliada)" />
            <div className="lightbox-actions">
              <a className="btn small" href={lightbox} target="_blank" rel="noreferrer">
                Abrir original ↗
              </a>
              <button className="btn small" onClick={() => setLightbox(null)}>
                Fechar ✕
              </button>
            </div>
          </div>
        </div>
      )}
      {!isError ? <StatusTimeline status={job.status} /> : <span className="status status-job-error">Erro</span>}

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

          <section className="resp-block">
            <h2>
              Estratégia <span className="muted small">(referência)</span>
            </h2>
            <dl className="resp-grid">
              <dt>Tema</dt>
              <dd>{draft.theme}</dd>
              <dt>Ângulo</dt>
              <dd>{draft.angle}</dd>
              <dt>Promessa</dt>
              <dd>{draft.promise}</dd>
              <dt>Público</dt>
              <dd>{draft.target_audience}</dd>
              <dt>Template (narrativa)</dt>
              <dd>{draft.selected_template}</dd>
              <dt>Formato</dt>
              <dd>{draft.format}</dd>
            </dl>
          </section>

          <section className="resp-block">
            <h2>Legenda</h2>
            <label className="field">
              <textarea rows={6} value={draft.caption} onChange={(e) => patchDraft({ caption: e.target.value })} />
            </label>
            <CommentField value={comments["caption"] ?? ""} onChange={(v) => patchComment("caption", v)} />
          </section>

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
                  <CommentField value={comments[`slide:${i}`] ?? ""} onChange={(v) => patchComment(`slide:${i}`, v)} />
                </div>
              ))}
            </div>
          </section>

          <section className="resp-block">
            <h2>Imagens ({draft.image_prompts.length})</h2>
            <p className="muted small">
              Para cada peça: escolha o <strong>template</strong> → <strong>Gerar prompt</strong> (o worker cria o
              prompt) → <strong>Gerar imagem</strong>.
            </p>
            <ul className="resp-prompts">
              {draft.image_prompts.map((p, i) => {
                const requesting = promptBusy[i] || p.prompt_status === "requested";
                const hasPrompt = !!p.prompt?.trim();
                return (
                  <li key={i}>
                    <div className="prompt-head">
                      <strong>{p.label ?? p.target}</strong>
                      <span className="chip">{p.aspect}</span>
                    </div>

                    <label className="field">
                      <span>Template (obrigatório)</span>
                      <select
                        value={p.template ?? ""}
                        disabled={requesting}
                        onChange={(e) => patchPrompt(i, { template: e.target.value || undefined })}
                      >
                        <option value="">— selecione —</option>
                        {lookups.templates.map((t) => (
                          <option key={t.id} value={t.label}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Estilo (obrigatório)</span>
                      <select
                        value={p.estilo ?? ""}
                        disabled={requesting}
                        onChange={(e) => patchPrompt(i, { estilo: e.target.value || undefined })}
                      >
                        <option value="">— selecione —</option>
                        {ESTILOS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="prompt-gen">
                      <button
                        className="btn small"
                        disabled={!p.template || !p.estilo || requesting}
                        title={
                          !p.template
                            ? "Escolha um template primeiro"
                            : !p.estilo
                              ? "Escolha um estilo primeiro"
                              : undefined
                        }
                        onClick={() => void gerarPrompt(i)}
                      >
                        {requesting ? "Gerando prompt…" : hasPrompt ? "Regerar prompt" : "Gerar prompt"}
                      </button>
                      {requesting && (
                        <span className="gen-status">
                          <span className="spinner" /> O worker está criando o prompt…
                        </span>
                      )}
                    </div>

                    <label className="field">
                      <span>Prompt</span>
                      <textarea
                        rows={3}
                        value={p.prompt ?? ""}
                        placeholder="Vazio até gerar o prompt (escolha o template e clique em Gerar prompt)."
                        onChange={(e) => patchPrompt(i, { prompt: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Negativo</span>
                      <input value={p.negative ?? ""} onChange={(e) => patchPrompt(i, { negative: e.target.value })} />
                    </label>
                    <CommentField value={comments[`prompt:${i}`] ?? ""} onChange={(v) => patchComment(`prompt:${i}`, v)} />
                    <ReferenceImages
                      selectedIds={refsByIdx[i] ?? []}
                      onChange={(ids) => setRefsByIdx((m) => ({ ...m, [i]: ids }))}
                    />
                    <div className="prompt-gen">
                      <button
                        className="btn primary small"
                        disabled={!hasPrompt || busyIdx !== null}
                        title={!hasPrompt ? "Gere o prompt antes de gerar a imagem" : undefined}
                        onClick={() => void gerarImagem(i, p.prompt, p.aspect)}
                      >
                        {busyIdx === i ? "Gerando…" : imgByIdx[i] ? "Gerar nova versão" : "Gerar imagem"}
                      </button>
                      {busyIdx === i && (
                        <span className="gen-status">
                          <span className="spinner" /> Gerando imagem na OpenAI… pode levar ~1 min.
                        </span>
                      )}
                      {imgByIdx[i] && (
                        <img
                          className="prompt-thumb"
                          src={imgByIdx[i]}
                          alt={`Imagem ${i + 1}`}
                          title="Clique para ampliar"
                          onClick={() => setLightbox(imgByIdx[i])}
                        />
                      )}
                    </div>
                    {errByIdx[i] && <p className="error-banner">{errByIdx[i]}</p>}
                  </li>
                );
              })}
            </ul>

            <p className="muted small">
              Safe area — topo {draft.safe_area.top_pct}% · base {draft.safe_area.bottom_pct}% · laterais{" "}
              {draft.safe_area.side_pct}%
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

          <section className="resp-block">
            <h2>Ações</h2>
            <div className="approval-actions">
              <button
                className="btn"
                disabled={finalBusy || !!job.finalized_at}
                onClick={() => void finalizar()}
              >
                {job.finalized_at ? "Finalizado" : finalBusy ? "Finalizando…" : "Finalizar post"}
              </button>
            </div>
            {job.finalized_at && (
              <p className="muted small">Finalizado em {new Date(job.finalized_at).toLocaleString("pt-BR")}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
