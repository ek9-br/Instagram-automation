-- Posts da home compartilhados (antes ficavam só no localStorage de cada um).
-- Tabela própria (jsonb), separada da `posts` legada/normalizada que não é usada
-- pelo front atual. Mesmo padrão de `creatives`: todos veem e editam todos.

create table if not exists public.post_board (
  id          uuid primary key default gen_random_uuid(),
  data        jsonb not null default '{}'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_post_board_created_at on public.post_board (created_at);

alter table public.post_board enable row level security;
drop policy if exists "dev_all_post_board" on public.post_board;
create policy "dev_all_post_board" on public.post_board
  for all to anon, authenticated using (true) with check (true);

drop trigger if exists trg_post_board_updated_at on public.post_board;
create trigger trg_post_board_updated_at
  before update on public.post_board
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.post_board;
