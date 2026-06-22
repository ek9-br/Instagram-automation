-- Bucket de Storage para as imagens geradas pela edge function.
-- Público para leitura (URLs vão para o banco de imagens / front-end).
-- A escrita é feita pela edge function com service role (ignora RLS).

insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', true)
on conflict (id) do nothing;

drop policy if exists "public read generated-images" on storage.objects;
create policy "public read generated-images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'generated-images');
