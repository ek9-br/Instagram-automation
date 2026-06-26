import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deletePost, newPostId, upsertPost, usePosts } from "../store";
import type { Option, Post, PostStatus, PostTipo, Proporcao } from "../types";
import { PROPORCOES, STATUS_LABELS, TIPO_LABELS } from "../types";
import { useLookups } from "../data/lookups";
import { createJob, fetchJob, JOB_STATUS_LABELS, type JobStatus } from "../data/jobs";
import { useAuth } from "../auth/AuthContext";

function emptyPost(): Post {
  return {
    id: newPostId(),
    tipo: "post",
    tema: "",
    sentimentoIds: [],
    anguloId: null,
    ctaId: null,
    legendaId: null,
    templateId: null,
    proporcao: "3_4",
    slidesCount: 3,
    status: "ideia",
    jobId: null,
    images: [],
    textoLegenda: "",
  };
}

// Mostra o status do job (polling) enquanto estiver na fila/processando.
function JobStatusBadge({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<JobStatus | "loading">("loading");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const job = await fetchJob(jobId);
        if (!active) return;
        if (job) {
          setStatus(job.status);
          if (job.status === "done" || job.status === "error") return; // para de pollar
        }
      } catch {
        /* ignora e tenta de novo */
      }
      timer = setTimeout(tick, 4000);
    }
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  const label = status === "loading" ? "…" : JOB_STATUS_LABELS[status];
  return <span className={`status status-job-${status}`}>{label}</span>;
}

function SelectCell(props: {
  value: string | null;
  options: Option[];
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {props.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Multi-select compacto (dropdown com checkboxes) para campos com 1+ valores.
function MultiSelectCell(props: {
  value: string[];
  options: Option[];
  onChange: (ids: string[]) => void;
}) {
  const selected = props.value ?? [];
  const toggle = (id: string) =>
    props.onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const summary =
    selected.length === 0
      ? "—"
      : selected.length === 1
        ? props.options.find((o) => o.id === selected[0])?.label ?? "1 selecionado"
        : `${selected.length} selecionados`;
  return (
    <details className="multi">
      <summary title={selected.map((id) => props.options.find((o) => o.id === id)?.label).join(", ")}>
        {summary}
      </summary>
      <div className="multi-menu">
        {props.options.length === 0 && <span className="muted small">sem opções</span>}
        {props.options.map((o) => (
          <label key={o.id} className="multi-opt">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function PostsPage() {
  const posts = usePosts();
  const navigate = useNavigate();
  const { data: lookups, loading } = useLookups();
  const { user, signOut } = useAuth();

  async function logout() {
    await signOut();
    navigate("/signin");
  }

  const [gerando, setGerando] = useState<string | null>(null);

  function patch(post: Post, changes: Partial<Post>) {
    upsertPost({ ...post, ...changes });
  }

  async function gerar(post: Post) {
    if (!post.tema.trim()) {
      alert("Informe um tema antes de gerar.");
      return;
    }
    setGerando(post.id);
    try {
      const { job_id } = await createJob({
        tipo: post.tipo,
        proporcao: post.proporcao ?? "3_4",
        tema: post.tema,
        slides_count: post.slidesCount,
        sentimento_ids: post.sentimentoIds,
        angulo_id: post.anguloId,
        cta_id: post.ctaId,
        legenda_id: post.legendaId,
      });
      upsertPost({ ...post, jobId: job_id, status: "texto_gerado" });
    } catch (e) {
      alert("Erro ao criar job: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="page wide">
      <header className="page-header">
        <h1>Posts</h1>
        {loading && <span className="muted small">carregando opções…</span>}
        {user?.email && <span className="muted small user-email">{user.email}</span>}
        <button className="btn ghost" onClick={() => navigate("/criativos")}>
          Criativos
        </button>
        <button className="btn ghost" onClick={() => navigate("/opcoes")}>
          Gerenciar opções
        </button>
        <button
          className="btn primary"
          onClick={() => upsertPost({ ...emptyPost(), createdBy: user?.email ?? undefined })}
        >
          + Nova linha
        </button>
        <button className="btn ghost" onClick={() => void logout()}>
          Sair
        </button>
      </header>

      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Slides</th>
              <th>Proporção</th>
              <th>Tema</th>
              <th>Sentimento</th>
              <th>Ângulo</th>
              <th>CTA</th>
              <th>Legenda</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">
                  Nenhum post ainda. Clique em "+ Nova linha".
                </td>
              </tr>
            )}
            {posts.map((post) => (
              <tr key={post.id}>
                <td>
                  <select
                    value={post.tipo}
                    onChange={(e) => patch(post, { tipo: e.target.value as PostTipo })}
                  >
                    {Object.entries(TIPO_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {post.createdBy && (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      por {post.createdBy}
                    </div>
                  )}
                </td>
                <td>
                  {post.tipo === "carrossel" ? (
                    <input
                      className="slides-input"
                      type="number"
                      min={1}
                      max={20}
                      value={post.slidesCount}
                      onChange={(e) =>
                        patch(post, {
                          slidesCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                        })
                      }
                    />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {post.tipo === "criativo" ? (
                    <span className="muted">—</span>
                  ) : (
                    <select
                      value={post.proporcao ?? "3_4"}
                      onChange={(e) => patch(post, { proporcao: e.target.value as Proporcao })}
                    >
                      {PROPORCOES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <input
                    type="text"
                    value={post.tema}
                    placeholder="Tema..."
                    onChange={(e) => patch(post, { tema: e.target.value })}
                  />
                </td>
                <td>
                  <MultiSelectCell
                    value={post.sentimentoIds}
                    options={lookups.sentimentos}
                    onChange={(ids) => patch(post, { sentimentoIds: ids })}
                  />
                </td>
                <td>
                  <SelectCell
                    value={post.anguloId}
                    options={lookups.angulos}
                    onChange={(id) => patch(post, { anguloId: id })}
                  />
                </td>
                <td>
                  <SelectCell
                    value={post.ctaId}
                    options={lookups.ctas}
                    onChange={(id) => patch(post, { ctaId: id })}
                  />
                </td>
                <td>
                  <SelectCell
                    value={post.legendaId}
                    options={lookups.legendas}
                    onChange={(id) => patch(post, { legendaId: id })}
                  />
                </td>
                <td>
                  {post.jobId ? (
                    <JobStatusBadge jobId={post.jobId} />
                  ) : (
                    <span className={`status status-${post.status}`}>
                      {STATUS_LABELS[post.status as PostStatus]}
                    </span>
                  )}
                </td>
                <td className="actions">
                  {!post.jobId ? (
                    <button
                      className="btn primary"
                      disabled={gerando === post.id}
                      onClick={() => void gerar(post)}
                    >
                      {gerando === post.id ? "Enviando…" : "Gerar"}
                    </button>
                  ) : (
                    <button className="btn" onClick={() => navigate(`/post/${post.id}`)}>
                      Abrir
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => deletePost(post.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
