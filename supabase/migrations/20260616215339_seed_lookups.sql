-- Seed das tabelas de lookup (mesmos valores que eram mock no front-end).
-- Idempotente: só insere se ainda não existir um label igual.

insert into public.sentimentos (label)
select v from (values ('Inspirador'),('Urgência'),('Empático'),('Divertido'),('Confiável')) as t(v)
where not exists (select 1 from public.sentimentos s where s.label = t.v);

insert into public.angulos (label)
select v from (values ('Educacional'),('Prova social'),('Antes e depois'),('Bastidores'),('Mito x verdade')) as t(v)
where not exists (select 1 from public.angulos a where a.label = t.v);

insert into public.ctas (label)
select v from (values ('Saiba mais'),('Comente abaixo'),('Compartilhe'),('Compre agora'),('Salve o post')) as t(v)
where not exists (select 1 from public.ctas c where c.label = t.v);

insert into public.legendas (label)
select v from (values ('Curta e direta'),('Storytelling'),('Lista de dicas'),('Pergunta de abertura')) as t(v)
where not exists (select 1 from public.legendas l where l.label = t.v);

insert into public.templates (label)
select v from (values ('Minimalista'),('Colorido'),('Foto + texto'),('Citação')) as t(v)
where not exists (select 1 from public.templates tp where tp.label = t.v);
