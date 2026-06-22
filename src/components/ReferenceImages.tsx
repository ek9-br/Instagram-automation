import { useState } from "react";
import type { ImageOrigin } from "../data/imageBank";
import { ORIGIN_LABELS, imagesByIds, useImageBank } from "../data/imageBank";

// Campo multiselect de imagens de referência (banco Supabase).
// Mostra as selecionadas + abre um modal pra escolher do banco.
// As imagens selecionadas acompanham o prompt enviado à OpenAI.

export default function ReferenceImages(props: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const bank = useImageBank();
  const [filter, setFilter] = useState<ImageOrigin | "todos">("todos");

  const selected = imagesByIds(props.selectedIds);
  const visible = filter === "todos" ? bank : bank.filter((b) => b.origin === filter);

  function toggle(id: string) {
    props.onChange(
      props.selectedIds.includes(id)
        ? props.selectedIds.filter((x) => x !== id)
        : [...props.selectedIds, id]
    );
  }

  return (
    <div className="refs">
      <div className="refs-head">
        <span className="field-label">Referências ({selected.length})</span>
        <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
          + Selecionar
        </button>
      </div>

      <div className="refs-thumbs">
        {selected.length === 0 && <span className="muted small">Nenhuma referência</span>}
        {selected.map((img) => (
          <div className="ref-thumb" key={img.id} title={img.name}>
            <img src={img.url} alt={img.name} />
            <button type="button" className="ref-remove" onClick={() => toggle(img.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Banco de imagens</strong>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-filters">
              {(["todos", "asset", "gerada"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`chip ${filter === f ? "active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "todos" ? "Todos" : ORIGIN_LABELS[f]}
                </button>
              ))}
            </div>

            <div className="modal-grid">
              {visible.map((img) => {
                const isSel = props.selectedIds.includes(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    className={`grid-item ${isSel ? "sel" : ""}`}
                    onClick={() => toggle(img.id)}
                  >
                    <img src={img.url} alt={img.name} />
                    <span className="grid-name">{img.name}</span>
                    {isSel && <span className="grid-check">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="modal-foot">
              <span className="muted small">{props.selectedIds.length} selecionada(s)</span>
              <button type="button" className="btn primary" onClick={() => setOpen(false)}>
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
