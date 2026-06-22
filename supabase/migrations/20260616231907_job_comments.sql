-- Comentários por campo editável do conteúdo gerado.
-- Chaveado por campo: "caption", "slide:0", "prompt:0", ...
alter table public.jobs
  add column comments jsonb not null default '{}'::jsonb;
