import { useNavigate, useParams } from "react-router-dom";
import { getPost, upsertPost, usePosts } from "../store";
import type { ImageUnit, Post } from "../types";
import { STATUS_LABELS, TIPO_LABELS, formatOf } from "../types";
import { generateImage, newSlide } from "../agent/mockAgent";
import { addImage } from "../data/imageBank";
import ReferenceImages from "../components/ReferenceImages";
import JobResult from "../components/JobResult";

export default function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  usePosts(); // re-render ao mudar o store
  const post = id ? getPost(id) : undefined;

  if (!post) {
    return (
      <div className="page">
        <p>Post não encontrado.</p>
        <button className="btn" onClick={() => navigate("/")}>
          ← Voltar
        </button>
      </div>
    );
  }

  function patch(changes: Partial<Post>) {
    if (post) upsertPost({ ...post, ...changes });
  }

  function patchUnit(unitId: string, changes: Partial<ImageUnit>) {
    if (!post) return;
    patch({
      images: post.images.map((u) => (u.id === unitId ? { ...u, ...changes } : u)),
    });
  }

  function gerarImagem(unit: ImageUnit) {
    const url = generateImage(unit.promptImagem, formatOf(unit));
    // toda imagem gerada entra no banco e fica selecionável como referência
    addImage(url, `${post?.tema || "Imagem"} · ${unit.label}`, "gerada");
    patchUnit(unit.id, { imagemUrl: url });
  }

  function addSlide() {
    if (!post) return;
    patch({ images: [...post.images, newSlide(post.images.length + 1)] });
  }

  function removeSlide(unitId: string) {
    if (!post) return;
    patch({ images: post.images.filter((u) => u.id !== unitId) });
  }

  // Com job criado: acompanha o status e exibe a response quando pronta.
  if (post.jobId) {
    return (
      <div className="page detail">
        <header className="page-header">
          <button className="btn ghost" onClick={() => navigate("/")}>
            ← Voltar
          </button>
          <h1>
            {post.tema || "Post sem tema"} <span className="tag">{TIPO_LABELS[post.tipo]}</span>
          </h1>
        </header>
        <JobResult jobId={post.jobId} />
      </div>
    );
  }

  const isCarrossel = post.tipo === "carrossel";

  return (
    <div className="page detail">
      <header className="page-header">
        <button className="btn ghost" onClick={() => navigate("/")}>
          ← Voltar
        </button>
        <h1>
          {post.tema || "Post sem tema"} <span className="tag">{TIPO_LABELS[post.tipo]}</span>
        </h1>
        <span className={`status status-${post.status}`}>{STATUS_LABELS[post.status]}</span>
      </header>

      <div className="units">
        {post.images.map((unit) => {
          const fmt = formatOf(unit);
          const ratio = fmt ? `${fmt.w} / ${fmt.h}` : "1 / 1";
          return (
            <div className="unit-card" key={unit.id}>
              <div className="unit-head">
                <span className="unit-title">{unit.label}</span>
                {isCarrossel && post.images.length > 1 && (
                  <button className="btn ghost" onClick={() => removeSlide(unit.id)}>
                    ✕
                  </button>
                )}
              </div>

              <div className="unit-body">
                <div className="unit-fields">
                  <label className="field">
                    <span>Texto da imagem</span>
                    <textarea
                      rows={3}
                      value={unit.textoImagem}
                      onChange={(e) => patchUnit(unit.id, { textoImagem: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Prompt da imagem</span>
                    <textarea
                      rows={3}
                      value={unit.promptImagem}
                      onChange={(e) => patchUnit(unit.id, { promptImagem: e.target.value })}
                    />
                  </label>
                  <ReferenceImages
                    selectedIds={unit.referenceImageIds}
                    onChange={(ids) => patchUnit(unit.id, { referenceImageIds: ids })}
                  />
                  <button className="btn primary" onClick={() => gerarImagem(unit)}>
                    {unit.imagemUrl ? "Gerar nova versão" : "Gerar imagem"}
                  </button>
                </div>

                <div className="unit-preview">
                  <div className="image-box" style={{ aspectRatio: ratio }}>
                    {unit.imagemUrl ? (
                      <img src={unit.imagemUrl} alt={unit.label} />
                    ) : (
                      <div className="image-placeholder">Sem imagem</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isCarrossel && (
        <button className="btn" onClick={addSlide}>
          + Adicionar slide
        </button>
      )}

      <label className="field legenda">
        <span>Texto da legenda</span>
        <textarea
          rows={6}
          value={post.textoLegenda}
          onChange={(e) => patch({ textoLegenda: e.target.value })}
        />
      </label>

      {post.status !== "pronto" && (
        <button className="btn" onClick={() => patch({ status: "pronto" })}>
          Marcar como pronto
        </button>
      )}
    </div>
  );
}
