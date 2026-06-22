-- Schema inicial do post-automation-agent
-- Tabelas de lookup (alimentam os selects da planilha) + posts + imagens.

-- ---------------------------------------------------------------------------
-- Helper: atualiza updated_at automaticamente
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas de lookup
-- ---------------------------------------------------------------------------
create table public.sentimentos (
  id    uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table public.angulos (
  id    uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table public.ctas (
  id    uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table public.legendas (
  id    uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

create table public.templates (
  id    uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null default 'post'
                  check (tipo in ('post', 'carrossel', 'criativo')),
  tema          text not null default '',
  sentimento_id uuid references public.sentimentos(id) on delete set null,
  angulo_id     uuid references public.angulos(id)     on delete set null,
  cta_id        uuid references public.ctas(id)        on delete set null,
  legenda_id    uuid references public.legendas(id)    on delete set null,
  template_id   uuid references public.templates(id)   on delete set null,
  slides_count  int  not null default 3 check (slides_count between 1 and 20),
  status        text not null default 'ideia'
                  check (status in ('ideia', 'texto_gerado', 'pronto')),
  texto_legenda text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Imagens (slides do carrossel, imagem do post, variações do criativo)
-- ---------------------------------------------------------------------------
create table public.post_images (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id) on delete cascade,
  position     int  not null default 0,
  label        text not null default '',
  format_id    text,                       -- ref. ao formato Meta (apenas criativo)
  texto_imagem text not null default '',
  prompt_imagem text not null default '',
  imagem_url   text,
  created_at   timestamptz not null default now()
);

create index idx_post_images_post_id on public.post_images(post_id);

-- ---------------------------------------------------------------------------
-- RLS — políticas permissivas para desenvolvimento (anon + authenticated).
-- TODO: restringir por marca/usuário quando entrarem auth e multi-marca.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sentimentos','angulos','ctas','legendas','templates','posts','post_images'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy "dev_all_%1$s" on public.%1$I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
