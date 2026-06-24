-- Variantes "esmaecida" (visual ghosted/integrado ao fundo). Idempotente.

insert into public.templates (label)
select v from (values
  ('Imagem na direita - texto a esquerda (esmaecida)'),
  ('Imagem na esquerda - texto a direita (esmaecida)')
) as t(v)
where not exists (select 1 from public.templates tp where tp.label = t.v);
