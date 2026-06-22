-- Bucket de Storage para imagens de REFERÊNCIA subidas pelo usuário.
-- Público para leitura (aparecem como "Assets" no seletor de referências do front).
-- A escrita é feita por upload com service role (script worker/upload-references.mjs).

insert into storage.buckets (id, name, public)
values ('reference-images', 'reference-images', true)
on conflict (id) do nothing;

-- Leitura pública (inclui list) para anon/authenticated — o front lista o bucket.
drop policy if exists "public read reference-images" on storage.objects;
create policy "public read reference-images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'reference-images');
