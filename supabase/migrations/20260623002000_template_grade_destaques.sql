-- Novo template visual: grade de destaques (2x2). Idempotente.

insert into public.templates (label)
select 'Grade de destaques (2x2)'
where not exists (select 1 from public.templates t where t.label = 'Grade de destaques (2x2)');
