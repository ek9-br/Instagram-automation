-- Template "Livre": sem regras de layout; a arte segue a imagem de referência.
-- Idempotente.

insert into public.templates (label)
select 'Livre'
where not exists (select 1 from public.templates t where t.label = 'Livre');
