import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOOKUPS, useLookups, type LookupDef, type LookupKey } from "../data/lookups";
import type { Option } from "../types";

function LookupRow(props: { lookupKey: LookupKey; option: Option }) {
  const { update, remove } = useLookups();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.option.label);
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = value.trim();
    if (!v || v === props.option.label) {
      setEditing(false);
      setValue(props.option.label);
      return;
    }
    setBusy(true);
    try {
      await update(props.lookupKey, props.option.id, v);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!confirm(`Excluir "${props.option.label}"?`)) return;
    setBusy(true);
    try {
      await remove(props.lookupKey, props.option.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="lookup-row">
      {editing ? (
        <input
          autoFocus
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setEditing(false);
              setValue(props.option.label);
            }
          }}
        />
      ) : (
        <span className="lookup-label">{props.option.label}</span>
      )}
      <span className="lookup-actions">
        {editing ? (
          <button className="btn small primary" disabled={busy} onClick={() => void save()}>
            Salvar
          </button>
        ) : (
          <button className="btn small ghost" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
        <button className="btn small ghost" disabled={busy} onClick={() => void del()}>
          ✕
        </button>
      </span>
    </li>
  );
}

function LookupCard(props: { def: LookupDef }) {
  const { data, create } = useLookups();
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);
  const options = data[props.def.key];

  async function add() {
    const v = novo.trim();
    if (!v) return;
    setBusy(true);
    try {
      await create(props.def.key, v);
      setNovo("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lookup-card">
      <h2>
        {props.def.label} <span className="muted small">({options.length})</span>
      </h2>
      <ul className="lookup-list">
        {options.length === 0 && <li className="muted small">Nenhuma opção ainda.</li>}
        {options.map((o) => (
          <LookupRow key={o.id} lookupKey={props.def.key} option={o} />
        ))}
      </ul>
      <div className="lookup-add">
        <input
          value={novo}
          placeholder={`Novo ${props.def.singular}...`}
          disabled={busy}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button className="btn primary" disabled={busy || !novo.trim()} onClick={() => void add()}>
          Adicionar
        </button>
      </div>
    </section>
  );
}

export default function LookupsAdminPage() {
  const navigate = useNavigate();
  const { loading, error, refresh } = useLookups();

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn ghost" onClick={() => navigate("/")}>
          ← Voltar
        </button>
        <h1>Opções (tabelas)</h1>
        <button className="btn" onClick={() => void refresh()}>
          Recarregar
        </button>
      </header>

      {error && <p className="error-banner">Erro: {error}</p>}
      {loading ? (
        <p className="muted">Carregando do Supabase…</p>
      ) : (
        <div className="lookup-grid">
          {LOOKUPS.map((def) => (
            <LookupCard key={def.key} def={def} />
          ))}
        </div>
      )}
    </div>
  );
}
