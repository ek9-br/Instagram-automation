-- Templates visuais (layout imagem×texto) da Coalize. Idempotente.

insert into public.templates (label)
select v from (values
  ('Imagem de fundo - Texto na esquerda'),
  ('Imagem de fundo - Texto na direita'),
  ('Imagem no topo - texto centralizado'),
  ('Imagem na esquerda - texto a direita'),
  ('Imagem na direita - texto a esquerda'),
  ('Somente texto')
) as t(v)
where not exists (select 1 from public.templates tp where tp.label = t.v);
