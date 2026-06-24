-- Novo template visual: lista de tópicos (sem imagem). Idempotente.

insert into public.templates (label)
select 'Lista de tópicos (sem imagem)'
where not exists (select 1 from public.templates t where t.label = 'Lista de tópicos (sem imagem)');
