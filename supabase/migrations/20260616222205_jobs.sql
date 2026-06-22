-- Fila de jobs de geração de post.
-- A edge function `create-job` insere com status 'pending'.
-- O worker local faz polling de 'pending', processa e atualiza para 'done'/'error'.

create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending'
                check (status in ('pending', 'processing', 'done', 'error')),
  brand       text not null default '',
  format      text not null
                check (format in (
                  'post_feed_4x5',
                  'carousel_4x5',
                  'stories_9x16',
                  'reels_cover_9x16',
                  'ads_landscape_1_91_1'
                )),
  inputs      jsonb not null default '{}'::jsonb,  -- selects crus vindos do front
  request     jsonb not null,                       -- post-request montado
  response    jsonb,                                -- post-response do worker
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

-- Índice para o polling do worker (pega o pending mais antigo primeiro).
create index idx_jobs_status_created on public.jobs (status, created_at);

create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- RLS permissiva para dev (mesmo padrão das demais tabelas).
alter table public.jobs enable row level security;
create policy "dev_all_jobs" on public.jobs
  for all to anon, authenticated using (true) with check (true);
