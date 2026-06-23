-- Criativos compartilhados (antes ficavam só no localStorage de cada navegador).
-- Tabela única: cada linha guarda o criativo (jsonb `data`) + autor.
-- RLS permissiva (mesmo padrão de jobs/lookups): todos veem e editam todos.

create table if not exists public.creatives (
  id          uuid primary key default gen_random_uuid(),
  data        jsonb not null default '{}'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_creatives_created_at on public.creatives (created_at desc);

alter table public.creatives enable row level security;
drop policy if exists "dev_all_creatives" on public.creatives;
create policy "dev_all_creatives" on public.creatives
  for all to anon, authenticated using (true) with check (true);

drop trigger if exists trg_creatives_updated_at on public.creatives;
create trigger trg_creatives_updated_at
  before update on public.creatives
  for each row execute function public.set_updated_at();

-- Habilita Realtime para sincronização ao vivo entre a equipe.
alter publication supabase_realtime add table public.creatives;
