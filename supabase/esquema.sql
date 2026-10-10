-- Esquema del Campamento del Age.
-- Pegar completo en Supabase → SQL Editor → Run.
-- Lectura pública (el dashboard usa la anon key); escritura solo para usuarios logueados.

create table if not exists partidas (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  mapa text not null,
  duracion_min integer check (duracion_min > 0),
  equipo_ganador integer not null,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists partida_jugadores (
  partida_id bigint not null references partidas (id) on delete cascade,
  jugador text not null,
  civ text not null,
  equipo integer not null,
  primary key (partida_id, jugador)
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
alter table partida_jugadores enable row level security;
alter table comidas enable row level security;
alter table actividades enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['partidas', 'partida_jugadores', 'comidas', 'actividades'] loop
    execute format('drop policy if exists "lectura publica" on %I', t);
    execute format('drop policy if exists "escritura logueados" on %I', t);
    execute format('create policy "lectura publica" on %I for select to anon, authenticated using (true)', t);
    execute format('create policy "escritura logueados" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
