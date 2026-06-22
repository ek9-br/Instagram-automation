import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { Option } from "../types";
import { supabase } from "../lib/supabase";

// Tabelas de lookup do Supabase que alimentam os selects e são editáveis (CRUD).
export type LookupKey = "sentimentos" | "angulos" | "ctas" | "legendas" | "templates";

export interface LookupDef {
  key: LookupKey;
  table: string;
  label: string; // título exibido na tela de administração
  singular: string;
}

export const LOOKUPS: LookupDef[] = [
  { key: "sentimentos", table: "sentimentos", label: "Sentimentos", singular: "sentimento" },
  { key: "angulos", table: "angulos", label: "Ângulos", singular: "ângulo" },
  { key: "ctas", table: "ctas", label: "CTAs", singular: "CTA" },
  { key: "legendas", table: "legendas", label: "Legendas", singular: "legenda" },
  { key: "templates", table: "templates", label: "Templates", singular: "template" },
];

export function labelOf(options: Option[], id: string | null): string {
  if (!id) return "—";
  return options.find((o) => o.id === id)?.label ?? "—";
}

// ---- CRUD bruto sobre o Supabase ------------------------------------------
async function fetchOptions(table: string): Promise<Option[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id,label")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Option[];
}

async function insertOption(table: string, label: string): Promise<void> {
  const { error } = await supabase.from(table).insert({ label });
  if (error) throw error;
}

async function patchOption(table: string, id: string, label: string): Promise<void> {
  const { error } = await supabase.from(table).update({ label }).eq("id", id);
  if (error) throw error;
}

async function removeOption(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// ---- Contexto: carrega as 5 tabelas e expõe as operações ------------------
type LookupData = Record<LookupKey, Option[]>;

const EMPTY: LookupData = { sentimentos: [], angulos: [], ctas: [], legendas: [], templates: [] };

interface LookupsContextValue {
  data: LookupData;
  loading: boolean;
  error: string | null;
  refresh: (key?: LookupKey) => Promise<void>;
  create: (key: LookupKey, label: string) => Promise<void>;
  update: (key: LookupKey, id: string, label: string) => Promise<void>;
  remove: (key: LookupKey, id: string) => Promise<void>;
}

const LookupsContext = createContext<LookupsContextValue | null>(null);

function tableOf(key: LookupKey): string {
  return LOOKUPS.find((l) => l.key === key)!.table;
}

export function LookupsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LookupData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(key?: LookupKey) {
    setError(null);
    try {
      if (key) {
        const opts = await fetchOptions(tableOf(key));
        setData((d) => ({ ...d, [key]: opts }));
      } else {
        setLoading(true);
        const results = await Promise.all(LOOKUPS.map((l) => fetchOptions(l.table)));
        const next = { ...EMPTY };
        LOOKUPS.forEach((l, i) => (next[l.key] = results[i]));
        setData(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: LookupsContextValue = {
    data,
    loading,
    error,
    refresh,
    create: async (key, label) => {
      await insertOption(tableOf(key), label);
      await refresh(key);
    },
    update: async (key, id, label) => {
      await patchOption(tableOf(key), id, label);
      await refresh(key);
    },
    remove: async (key, id) => {
      await removeOption(tableOf(key), id);
      await refresh(key);
    },
  };

  return createElement(LookupsContext.Provider, { value }, children);
}

export function useLookups(): LookupsContextValue {
  const ctx = useContext(LookupsContext);
  if (!ctx) throw new Error("useLookups deve ser usado dentro de <LookupsProvider>");
  return ctx;
}
