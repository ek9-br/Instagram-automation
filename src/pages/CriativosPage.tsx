import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CREATIVE_FORMATS, ESTILOS, creativeFormatOf, INSTAGRAM_SAFEZONES } from "../types";
import type { Creative, CreativeStatus, SafezoneSpec } from "../types";
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

// Prompt usado ao regerar: troca o fundo preto da safezone por uma extensão
// natural do próprio cenário, sem mover o conteúdo central.
const BG_REPLACE_PROMPT =
  "Substitua o fundo preto desta imagem por uma extensão natural e contínua do próprio cenário/fundo da imagem, preenchendo todas as bordas pretas até as extremidades. Mantenha o conteúdo central (produto, pessoas, textos) exatamente na mesma posição e tamanho, sem mover, cortar ou cobrir. Resultado fotográfico, coeso e natural, pronto para anúncio.";

const STATUS_LABEL: Record<CreativeStatus, string> = {
  idle: "—",
  generating: "Gerando imagem…",
  revising: "Revisando (worker)…",
  safezoning: "Aplicando safezone…",
  regenerating: "Regerando com safezone…",
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
    safezoneUrl: null,
    finalUrl: null,
    error: null,
  };
}

export default function CriativosPage() {
  const creatives = useCreatives();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [lightbox, setLightbox] = useState<{ url: string; formatId: string } | null>(null);
  const [showSafezone, setShowSafezone] = useState(false);
  // rascunho do comentário de revisão por criativo (só persiste ao aplicar)
  const [revDraft, setRevDraft] = useState<Record<string, string>>({});

  function openLightbox(url: string, formatId: string) {
    setShowSafezone(false);
    setLightbox({ url, formatId });
  }

  async function logout() {
    await signOut();
    navigate("/signin");
  }

  function patch(c: Creative, changes: Partial<Creative>) {
    upsertCreative({ ...c, ...changes });
  }

  const busy = (c: Creative) =>
    c.status === "generating" ||
    c.status === "revising" ||
    c.status === "safezoning" ||
    c.status === "regenerating";

  // Revisão: registra o comentário do humano e marca para o worker regerar
  // prompt + imagem (e, se for regra durável, atualizar estilo/template). O
  // Realtime traz a imagem nova de volta automaticamente.
  function aplicarRevisao(c: Creative) {
    const text = (revDraft[c.id] ?? "").trim();
    if (!text) {
      alert("Escreva o comentário de revisão antes de aplicar.");
      return;
    }
    upsertCreative({
      ...c,
      revision: text,
      revisionStatus: "requested",
      revisionNote: undefined,
      status: "revising",
      error: null,
    });
    setRevDraft((m) => ({ ...m, [c.id]: "" }));
  }

  // 1) Gera a imagem crua a partir do prompt (+ referências). Reseta as etapas seguintes.
  async function gerar(c: Creative) {
    if (!c.prompt.trim()) {
      alert("Cole um prompt antes de gerar.");
      return;
    }
    if (!c.estilo) {
      alert("Selecione um estilo antes de gerar.");
      return;
    }
    const cur: Creative = {
      ...c,
      status: "generating",
      error: null,
      rawUrl: null,
      safezoneUrl: null,
      finalUrl: null,
    };
    upsertCreative(cur);
    try {
      const references = imagesByIds(c.referenceImageIds ?? []).map((b) => b.url);
      const fullPrompt = c.estilo
        ? `${c.prompt}\n\nEstilo/paleta visual: ${c.estilo} (Claro = fundo claro/off-white; Azul escuro = fundo azul-escuro; Verde Escuro = fundo verde/teal escuro).`
        : c.prompt;
      const { url: raw } = await generateImageFromPrompt(fullPrompt, "portrait", references);
      upsertCreative({ ...cur, status: "idle", rawUrl: raw });
    } catch (e) {
      upsertCreative({ ...cur, status: "error", error: msg(e) });
    }
  }

  // 2) Aplica a safezone preta sobre a imagem crua (miolo + fundo preto no tamanho final).
  async function aplicarSafezone(c: Creative) {
    const fmt = creativeFormatOf(c);
    if (!c.rawUrl || !fmt) return;
    const cur: Creative = { ...c, status: "safezoning", error: null };
    upsertCreative(cur);
    try {
      const { url: sz } = await applySafeGuard(c.rawUrl, fmt.safeguard);
      upsertCreative({ ...cur, status: "idle", safezoneUrl: sz, finalUrl: null });
    } catch (e) {
      upsertCreative({ ...cur, status: "error", error: msg(e) });
    }
  }

  // 3) Regera na OpenAI usando a safezone como referência, trocando o preto por
  //    uma continuação natural do cenário.
  async function regerarComSafezone(c: Creative) {
    const fmt = creativeFormatOf(c);
    if (!c.safezoneUrl) return;
    const cur: Creative = { ...c, status: "regenerating", error: null };
    upsertCreative(cur);
    try {
      const { url: fin } = await generateImageFromPrompt(BG_REPLACE_PROMPT, "portrait", [
        c.safezoneUrl,
      ]);
      upsertCreative({ ...cur, status: "idle", finalUrl: fin });
      addImage(fin, `Criativo ${fmt?.label ?? ""}`.trim(), "gerada");
    } catch (e) {
      upsertCreative({ ...cur, status: "error", error: msg(e) });
    }
  }

  function stageLabel(c: Creative): string {
    if (busy(c)) return STATUS_LABEL[c.status];
    if (c.status === "error") return "Erro";
    if (c.finalUrl) return "Final pronto";
    if (c.safezoneUrl) return "Safezone aplicada";
    if (c.rawUrl) return "Gerada";
    return "—";
  }

  function Thumb({ url, caption, formatId }: { url: string; caption: string; formatId: string }) {
    return (
      <figure className="cre-fig">
        <img
          className="prompt-thumb"
          src={url}
          alt={caption}
          title="Clique para ampliar"
          onClick={() => openLightbox(url, formatId)}
        />
        <figcaption>{caption}</figcaption>
      </figure>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn ghost" onClick={() => navigate("/")}>
          ← Posts
        </button>
        <h1>Criativos</h1>
        {user?.email && <span className="muted small user-email">{user.email}</span>}
        <button
          className="btn primary"
          onClick={() => upsertCreative({ ...emptyCreative(), createdBy: user?.email ?? undefined })}
        >
          + Nova linha
        </button>
        <button className="btn ghost" onClick={() => void logout()}>
          Sair
        </button>
      </header>

      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Fluxo por linha: <strong>Gerar</strong> → valide a imagem → <strong>Aplicar
        safezone</strong> (fundo preto) → <strong>Regerar com safezone</strong> (a OpenAI
        troca o preto por uma continuação natural do cenário). Tudo fica na própria linha.
      </p>

      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th style={{ width: 150 }}>Formato</th>
              <th>Prompt</th>
              <th style={{ width: 200 }}>Referências</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ width: 230 }}>Resultado</th>
              <th style={{ width: 180 }}></th>
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
                  <select
                    style={{ marginTop: 6, display: "block", width: "100%" }}
                    value={c.estilo ?? ""}
                    disabled={busy(c)}
                    onChange={(e) => patch(c, { estilo: e.target.value || undefined })}
                  >
                    <option value="">Estilo (obrigatório)</option>
                    {ESTILOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {c.createdBy && (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      por {c.createdBy}
                    </div>
                  )}
                </td>
                <td>
                  <textarea
                    rows={3}
                    value={c.prompt}
                    placeholder="Cole o prompt da imagem…"
                    disabled={busy(c)}
                    onChange={(e) => patch(c, { prompt: e.target.value })}
                  />
                  {c.rawUrl && (
                    <div className="revision-box">
                      <span className="muted small">Prompt de revisão</span>
                      <textarea
                        rows={2}
                        value={revDraft[c.id] ?? ""}
                        placeholder="Comentário do revisor (ex.: deixe o fundo mais escuro, headline maior)…"
                        disabled={busy(c)}
                        onChange={(e) => setRevDraft((m) => ({ ...m, [c.id]: e.target.value }))}
                      />
                      <button
                        className="btn small"
                        disabled={busy(c) || !(revDraft[c.id] ?? "").trim()}
                        onClick={() => aplicarRevisao(c)}
                      >
                        {c.status === "revising" ? "Revisando…" : "Aplicar revisão e regerar"}
                      </button>
                      {c.revisionNote && <p className="muted small">🧠 {c.revisionNote}</p>}
                    </div>
                  )}
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
                    <>
                      <span className="status status-job-error">Erro</span>
                      {c.error && (
                        <p className="error-banner" style={{ marginTop: 6 }}>
                          {c.error}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="muted small">{stageLabel(c)}</span>
                  )}
                </td>
                <td>
                  <div className="cre-results">
                    {c.rawUrl && <Thumb url={c.rawUrl} caption="Gerada" formatId={c.formatId} />}
                    {c.safezoneUrl && (
                      <Thumb url={c.safezoneUrl} caption="Safezone" formatId={c.formatId} />
                    )}
                    {c.finalUrl && <Thumb url={c.finalUrl} caption="Final" formatId={c.formatId} />}
                    {!c.rawUrl && <span className="muted small">—</span>}
                  </div>
                </td>
                <td>
                  <div className="cre-actions">
                    <button
                      className="btn primary small"
                      disabled={busy(c) || !c.prompt.trim() || !c.estilo}
                      title={!c.estilo ? "Escolha um estilo primeiro" : undefined}
                      onClick={() => void gerar(c)}
                    >
                      {c.status === "generating"
                        ? "Gerando…"
                        : c.rawUrl
                          ? "Gerar de novo"
                          : "Gerar"}
                    </button>
                    {c.rawUrl && (
                      <button
                        className="btn small"
                        disabled={busy(c)}
                        onClick={() => void aplicarSafezone(c)}
                      >
                        {c.status === "safezoning"
                          ? "Aplicando…"
                          : c.safezoneUrl
                            ? "Aplicar safezone de novo"
                            : "Aplicar safezone"}
                      </button>
                    )}
                    {c.safezoneUrl && (
                      <button
                        className="btn small"
                        disabled={busy(c)}
                        onClick={() => void regerarComSafezone(c)}
                      >
                        {c.status === "regenerating"
                          ? "Regerando…"
                          : c.finalUrl
                            ? "Regerar com safezone"
                            : "Regerar com safezone"}
                      </button>
                    )}
                    <button
                      className="btn ghost small"
                      disabled={busy(c)}
                      onClick={() => deleteCreative(c.id)}
                    >
                      ✕ Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lightbox &&
        (() => {
          const fmt = CREATIVE_FORMATS.find((f) => f.id === lightbox.formatId);
          const sz = INSTAGRAM_SAFEZONES[lightbox.formatId];
          return (
            <div className="lightbox" onClick={() => setLightbox(null)}>
              <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
                <div
                  className="lightbox-frame"
                  style={fmt ? { aspectRatio: `${fmt.w} / ${fmt.h}` } : undefined}
                >
                  <img src={lightbox.url} alt="Criativo (ampliado)" />
                  {showSafezone && sz && <SafezoneOverlay spec={sz} />}
                </div>
                <div className="lightbox-actions">
                  <button
                    className={`btn small ${showSafezone ? "primary" : ""}`}
                    onClick={() => setShowSafezone((v) => !v)}
                  >
                    {showSafezone ? "Ocultar safezone" : "Preview safezone"}
                  </button>
                  <a className="btn small" href={lightbox.url} target="_blank" rel="noreferrer">
                    Abrir original ↗
                  </a>
                  <button className="btn small" onClick={() => setLightbox(null)}>
                    Fechar ✕
                  </button>
                </div>
                {showSafezone && fmt && (
                  <span className="muted small">
                    Safezone Instagram 2026 — {fmt.label}. Mantenha texto/logo/rosto na área
                    central (tracejado).
                  </span>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// Overlay das margens reservadas pela UI do Instagram (faixas vermelhas) +
// contorno da área central segura (tracejado verde).
function SafezoneOverlay({ spec }: { spec: SafezoneSpec }) {
  const labelFor = (side: "top" | "bottom" | "left" | "right") =>
    spec.zones.find((z) => z.side === side)?.label;
  return (
    <div className="sz">
      <div className="sz-band sz-top" style={{ height: `${spec.top}%` }}>
        {labelFor("top") && <span>{labelFor("top")}</span>}
      </div>
      <div className="sz-band sz-bottom" style={{ height: `${spec.bottom}%` }}>
        {labelFor("bottom") && <span>{labelFor("bottom")}</span>}
      </div>
      <div
        className="sz-band sz-left"
        style={{ width: `${spec.left}%`, top: `${spec.top}%`, bottom: `${spec.bottom}%` }}
      />
      <div
        className="sz-band sz-right"
        style={{ width: `${spec.right}%`, top: `${spec.top}%`, bottom: `${spec.bottom}%` }}
      >
        {labelFor("right") && <span>{labelFor("right")}</span>}
      </div>
      <div
        className="sz-safe"
        style={{
          top: `${spec.top}%`,
          bottom: `${spec.bottom}%`,
          left: `${spec.left}%`,
          right: `${spec.right}%`,
        }}
      />
    </div>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
