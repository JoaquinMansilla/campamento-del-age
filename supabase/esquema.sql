-- Esquema del Campamento del Age.
-- Pegar completo en Supabase → SQL Editor → Run.
-- Lectura pública (el dashboard usa la anon key).
-- Comidas y actividades: escriben los usuarios logueados.
-- Partidas: solo las escribe el sincronizador, con un token cuyo hash vive en privado.claves.

create table if not exists partidas (
  id bigint primary key,
  inicio timestamptz not null,
  datos jsonb not null,
  actualizado timestamptz not null default now()
);

create table if not exists comidas (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  momento text not null check (momento in ('desayuno', 'almuerzo', 'merienda', 'cena')),
  plato text not null,
  cocineros text[] not null default '{}',
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists actividades (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  nombre text not null,
  descripcion text,
  participantes text[] not null default '{}',
  creado_en timestamptz not null default now()
);

alter table partidas enable row level security;
alter table comidas enable row level security;
alter table actividades enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['partidas', 'comidas', 'actividades'] loop
    execute format('drop policy if exists "lectura publica" on %I', t);
    execute format('drop policy if exists "escritura logueados" on %I', t);
    execute format('create policy "lectura publica" on %I for select to anon, authenticated using (true)', t);
  end loop;
  foreach t in array array['comidas', 'actividades'] loop
    execute format('create policy "escritura logueados" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- El esquema privado no está expuesto por la API: nadie puede leer los hashes desde afuera.
create schema if not exists privado;
create table if not exists privado.claves (
  nombre text primary key,
  hash text not null
);

-- Guarda (o actualiza) partidas ya normalizadas por scripts/sincronizar.mjs.
create or replace function public.guardar_partidas(p_token text, p_partidas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  guardadas integer;
begin
  if not exists (
    select 1 from privado.claves
    where nombre = 'sincronizador' and hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'token invalido' using errcode = '28000';
  end if;

  insert into public.partidas (id, inicio, datos)
  select (p->>'id')::bigint, (p->>'inicio')::timestamptz, p
  from jsonb_array_elements(p_partidas) as p
  on conflict (id) do update set inicio = excluded.inicio, datos = excluded.datos, actualizado = now();

  get diagnostics guardadas = row_count;
  return guardadas;
end $$;

revoke all on function public.guardar_partidas(text, jsonb) from public;
grant execute on function public.guardar_partidas(text, jsonb) to anon, authenticated;
