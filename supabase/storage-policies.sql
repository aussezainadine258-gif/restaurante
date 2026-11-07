-- Supabase Storage para as fotografias e vídeos dos pratos.
-- Execute este ficheiro no SQL Editor do Supabase.
--
-- Nota: o servidor Express usa a service_role key (nunca exposta ao browser)
-- e por isso ignora RLS. As políticas abaixo protegem acessos diretos ao
-- Storage feitos por utilizadores autenticados com papel 'admin'.
-- Ajuste a expressão do papel se o seu projeto usar outro claim (por exemplo
-- auth.jwt() ->> 'role' = 'admin').

-- ---------------------------------------------------------------- buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pratos',
  'pratos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos-pratos',
  'videos-pratos',
  true,
  5242880,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- --------------------------------------------------------------- políticas
-- Leitura pública
drop policy if exists "Leitura publica fotos pratos" on storage.objects;
create policy "Leitura publica fotos pratos"
  on storage.objects for select
  using (bucket_id = 'pratos');

drop policy if exists "Leitura publica videos pratos" on storage.objects;
create policy "Leitura publica videos pratos"
  on storage.objects for select
  using (bucket_id = 'videos-pratos');

-- Escrita apenas para administradores autenticados
drop policy if exists "Admin insere fotos pratos" on storage.objects;
create policy "Admin insere fotos pratos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admin atualiza fotos pratos" on storage.objects;
create policy "Admin atualiza fotos pratos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admin apaga fotos pratos" on storage.objects;
create policy "Admin apaga fotos pratos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admin insere videos pratos" on storage.objects;
create policy "Admin insere videos pratos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'videos-pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admin atualiza videos pratos" on storage.objects;
create policy "Admin atualiza videos pratos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'videos-pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'videos-pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admin apaga videos pratos" on storage.objects;
create policy "Admin apaga videos pratos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'videos-pratos'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
