-- Adiciona os sentimentos da Coalize à tabela de lookup `sentimentos`.
-- Idempotente: só insere o label que ainda não existe (ex.: "Urgência" já existe).

insert into public.sentimentos (label)
select v from (values
  ('Alerta'),
  ('Alívio'),
  ('Ambição'),
  ('Clareza'),
  ('Confiança'),
  ('Confusão'),
  ('Controle'),
  ('Curiosidade'),
  ('Fascínio'),
  ('Frustração'),
  ('Insegurança'),
  ('Medo'),
  ('Pertencimento'),
  ('Poder'),
  ('Segurança'),
  ('Simplicidade'),
  ('Superioridade'),
  ('Urgência')
) as t(v)
where not exists (select 1 from public.sentimentos s where s.label = t.v);
