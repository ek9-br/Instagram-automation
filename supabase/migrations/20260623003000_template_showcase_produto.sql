-- Novo template visual: showcase de produto (hero em camadas). Idempotente.

insert into public.templates (label)
select 'Showcase de produto'
where not exists (select 1 from public.templates t where t.label = 'Showcase de produto');
