-- Remove a camada de aprovação dos jobs (não faz mais sentido no fluxo).
-- Tira o trigger e a função de enforcement. As colunas de approval são mantidas
-- (inofensivas) para não quebrar selects existentes, mas não são mais exigidas.

drop trigger if exists trg_enforce_job_approval on public.jobs;
drop function if exists public.enforce_job_approval();
