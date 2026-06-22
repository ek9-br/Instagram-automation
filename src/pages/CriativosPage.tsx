import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CREATIVE_FORMATS, creativeFormatOf } from "../types";
import type { Creative, CreativeStatus } from "../types";
import {
  deleteCreative,
  newCreativeId,
  upsertCreative,
  useCreatives,
} from "../data/creativesStore";
import { applySafeGuard, generateImageFromPrompt } from "../data/jobs";
import { addImage, imagesByIds } from "../data/imageBank";
import ReferenceImages from "../components/ReferenceImages";
import { useAuth } from "../auth/AuthContext";

const STATUS_LABEL: Record<CreativeStatus, string> = {
  idle: "—",
  generating: "Gerando imagem…",
  safezone: "Aplicando safezone…",
  done: "Pronto",
  error: "Erro",
};

function emptyCreative(): Creative {
  return {
    id: newCreativeId(),
    formatId: "9_16",
    prompt: "",
    referenceImageIds: [],
    status: "idle",
    rawUrl: null,
    finalUrl: null,
    error: null,
  };
}

export default function CriativosPage() {
  const creatives = useCreatives();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function logout() {
    await signOut();
    navigate("/signin");
  }

  function patch(c: Creative, changes: Partial<Creative>) {
    upsertCreative({ ...c, ...changes });
  }

  // Gera a imagem (OpenAI) e, em seguida, aplica a safezone do formato escolhido.
  async function gerar(c: Creative) {
    const fmt = creativeFormatOf(c);
    if (!c.prompt.trim()) {
      alert("Cole um prompt antes de gerar.");
      return;
    }
    if (!fmt) return;
    let cur: Creative = { ...c, status: "generating", error: null };
    upsertCreative(cur);
    try {
      // imagens de referência selecionadas → URLs enviadas no payload da OpenAI
      const references = imagesByIds(c.referenceImageIds ?? []).map((b) => b.url);
      const { url: raw } = await generateImageFromPrompt(c.prompt, "portrait", references);
      cur = { ...cur, status: "safezone", rawUrl: raw };
      upsertCreative(cur);
      const { url: final } = await applySafeGuard(raw, fmt.safeguard);
      cur = { ...cur, status: "done", finalUrl: final };
      upsertCreative(cur);
      addImage(final, `Criativo ${fmt.label}`, "gerada");
    } catch (e) {
      upsertCreative({
        ...cur,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const busy = (c: Creative) => c.status === "generating" || c.status === "safezone";

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn ghost" onClick={() => navigate("/")}>
          ← Posts
        </button>
        <h1>Criativos</h1>
        {user?.email && <span className="muted small user-email">{user.email}</span>}
        <button className="btn primary" onClick={() => upsertCreative(emptyCreative())}>
          + Nova linha
        </button>
        <button className="btn ghost" onClick={() => void logout()}>
          Sair
        </button>
      </header>

      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Cada linha: escolha o formato, cole o prompt e clique em <strong>Gerar</strong>. A
        imagem é criada e a <strong>safezone</strong> é aplicada automaticamente — o
        resultado fica na própria linha.
      </p>

      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Formato</th>
              <th>Prompt</th>
              <th style={{ width: 220 }}>Referências</th>
              <th style={{ width: 150 }}>Status</th>
              <th style={{ width: 130 }}>Resultado</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {creatives.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Nenhum criativo ainda. Clique em "+ Nova linha".
                </td>
              </tr>
            )}
            {creatives.map((c) => (
              <tr key={c.id}>
                <td>
                  <select
                    value={c.formatId}
                    disabled={busy(c)}
                    onChange={(e) => patch(c, { formatId: e.target.value })}
                  >
                    {CREATIVE_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    rows={3}
                    value={c.prompt}
                    placeholder="Cole o prompt da imagem…"
                    disabled={busy(c)}
                    onChange={(e) => patch(c, { prompt: e.target.value })}
                  />
                </td>
                <td>
                  <ReferenceImages
                    selectedIds={c.referenceImageIds ?? []}
                    onChange={(ids) => patch(c, { referenceImageIds: ids })}
                  />
                </td>
                <td>
                  {busy(c) ? (
                    <span className="gen-status">
                      <span className="spinner" /> {STATUS_LABEL[c.status]}
                    </span>
                  ) : c.status === "error" ? (
                    <span className="status status-job-error" title={c.error ?? ""}>
                      Erro
                    </span>
                  ) : (
                    <span className="muted small">{STATUS_LABEL[c.status]}</span>
                  )}
                  {c.status === "error" && c.error && (
                    <p className="error-banner" style={{ marginTop: 6 }}>
                      {c.error}
                    </p>
                  )}
                </td>
                <td>
                  {c.finalUrl ? (
                    <img
                      className="prompt-thumb"
                      src={c.finalUrl}
                      alt="Criativo"
                      title="Clique para ampliar"
                      onClick={() => setLightbox(c.finalUrl)}
                    />
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
                <td className="actions">
                  <button
                    className="btn primary"
                    disabled={busy(c) || !c.prompt.trim()}
                    onClick={() => void gerar(c)}
                  >
                    {busy(c) ? "Gerando…" : c.finalUrl ? "Gerar de novo" : "Gerar"}
                  </button>
                  <button
                    className="btn ghost"
                    disabled={busy(c)}
                    onClick={() => deleteCreative(c.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox} alt="Criativo (ampliado)" />
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
    </div>
  );
}
