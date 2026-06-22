-- Adiciona os CTAs da Coalize à tabela de lookup `ctas`. Idempotente.

insert into public.ctas (label)
select v from (values
  ('Inscreva-se'),
  ('Link na Bio'),
  ('Compartilhe'),
  ('Comente'),
  ('Comente e Compartilhe'),
  ('Acesse nosso site'),
  ('Clique no link da Legenda'),
  ('Teste Grátis')
) as t(v)
where not exists (select 1 from public.ctas c where c.label = t.v);
