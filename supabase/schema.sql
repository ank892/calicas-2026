-- =====================================================================
-- CALICAS 2026 - Esquema de quiniela del Mundial FIFA 2026
-- Proyecto Supabase: ED26 (oxhkgtcqbsgjzagpziee)
-- Prefijo de tablas: ed26_calicas_
-- =====================================================================

-- ---- Usuarios ---------------------------------------------------------
create table if not exists public.ed26_calicas_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  avatar_emoji text default '⚽',
  country text default 'CR',
  created_at timestamptz not null default now()
);

create index if not exists ed26_calicas_users_email_idx on public.ed26_calicas_users (lower(email));

-- ---- Cache de partidos (espejo de worldcup26.ir) ---------------------
create table if not exists public.ed26_calicas_matches (
  id text primary key,                       -- id de la API externa
  home_team_name text not null,
  away_team_name text not null,
  home_team_id text,
  away_team_id text,
  home_score int,
  away_score int,
  group_letter text,                          -- 'A'..'L' o null
  matchday int,
  phase text not null,                        -- group | round_of_32 | round_of_16 | quarter_final | semi_final | third_place | final
  stadium_id text,
  kickoff_local text,                         -- string crudo "MM/DD/YYYY HH:MM"
  kickoff_utc timestamptz,                    -- normalizado a UTC
  finished boolean not null default false,
  status text not null default 'notstarted',  -- notstarted | live | finished
  last_synced timestamptz not null default now()
);

create index if not exists ed26_calicas_matches_phase_idx on public.ed26_calicas_matches (phase);
create index if not exists ed26_calicas_matches_kickoff_idx on public.ed26_calicas_matches (kickoff_utc);

-- ---- Pronósticos -----------------------------------------------------
create table if not exists public.ed26_calicas_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ed26_calicas_users(id) on delete cascade,
  match_id text not null references public.ed26_calicas_matches(id) on delete cascade,
  pred_home int not null check (pred_home >= 0 and pred_home <= 30),
  pred_away int not null check (pred_away >= 0 and pred_away <= 30),
  points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists ed26_calicas_pred_user_idx on public.ed26_calicas_predictions (user_id);
create index if not exists ed26_calicas_pred_match_idx on public.ed26_calicas_predictions (match_id);

-- ---- Ganadores por fase ----------------------------------------------
create table if not exists public.ed26_calicas_phase_winners (
  phase text not null,
  user_id uuid not null references public.ed26_calicas_users(id) on delete cascade,
  points int not null default 0,
  awarded_at timestamptz not null default now(),
  primary key (phase, user_id)
);

-- ---- Vista de tabla general -----------------------------------------
create or replace view public.ed26_calicas_leaderboard as
select
  u.id            as user_id,
  u.display_name,
  u.avatar_emoji,
  u.email,
  coalesce(sum(p.points), 0)::int as total_points,
  count(p.id) filter (where p.points = 5)::int  as exactos,
  count(p.id) filter (where p.points = 3)::int  as parciales,
  count(p.id) filter (where p.points = 2)::int  as resultados,
  count(p.id) filter (where p.points = 0 and exists (
      select 1 from public.ed26_calicas_matches m where m.id = p.match_id and m.finished = true
    ))::int as fallos,
  count(p.id)::int as predicciones_totales
from public.ed26_calicas_users u
left join public.ed26_calicas_predictions p on p.user_id = u.id
group by u.id, u.display_name, u.avatar_emoji, u.email;

-- ---- RLS abierta (auth simple, sin tokens) ---------------------------
alter table public.ed26_calicas_users        enable row level security;
alter table public.ed26_calicas_matches      enable row level security;
alter table public.ed26_calicas_predictions  enable row level security;
alter table public.ed26_calicas_phase_winners enable row level security;

-- Políticas: lectura pública + escritura pública (la app no usa Supabase Auth).
-- Si quieres restringir más, ajusta a tu gusto. Por ahora todos pueden leer/escribir.
do $$ begin
  create policy ed26_calicas_users_all      on public.ed26_calicas_users        for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ed26_calicas_matches_all    on public.ed26_calicas_matches      for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ed26_calicas_pred_all       on public.ed26_calicas_predictions  for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ed26_calicas_winners_all    on public.ed26_calicas_phase_winners for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ---- Trigger de bloqueo (30 min antes del kickoff) ------------------
create or replace function public.ed26_calicas_check_prediction_lock()
returns trigger language plpgsql as $$
declare
  v_kickoff timestamptz;
begin
  select kickoff_utc into v_kickoff
  from public.ed26_calicas_matches
  where id = new.match_id;

  if v_kickoff is null then
    return new;
  end if;

  if now() >= (v_kickoff - interval '30 minutes') then
    raise exception using
      errcode = 'check_violation',
      message = 'Este partido esta cerrado para pronosticos (faltan menos de 30 minutos para el inicio).';
  end if;

  return new;
end $$;

drop trigger if exists ed26_calicas_predictions_lock on public.ed26_calicas_predictions;
create trigger ed26_calicas_predictions_lock
  before insert or update of pred_home, pred_away
  on public.ed26_calicas_predictions
  for each row execute function public.ed26_calicas_check_prediction_lock();

-- Realtime
alter publication supabase_realtime add table public.ed26_calicas_predictions;
alter publication supabase_realtime add table public.ed26_calicas_matches;

-- =====================================================================
-- CLANES (grupos): cada usuario puede pertenecer hasta a 2 clanes.
-- Quien crea el clan es el owner (único que puede editarlo).
-- =====================================================================
create table if not exists public.ed26_calicas_clans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_lower text generated always as (lower(name)) stored unique,
  emoji text default '🛡️',
  owner_user_id uuid not null references public.ed26_calicas_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ed26_calicas_clans_owner_idx on public.ed26_calicas_clans (owner_user_id);

create table if not exists public.ed26_calicas_clan_members (
  clan_id uuid not null references public.ed26_calicas_clans(id) on delete cascade,
  user_id uuid not null references public.ed26_calicas_users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index if not exists ed26_calicas_clan_members_user_idx on public.ed26_calicas_clan_members (user_id);

create or replace function public.ed26_calicas_check_max_clans()
returns trigger language plpgsql as $$
declare cnt int;
begin
  select count(*) into cnt from public.ed26_calicas_clan_members where user_id = new.user_id;
  if cnt >= 4 then
    raise exception using
      errcode = 'check_violation',
      message = 'Cada jugador puede pertenecer a un maximo de 4 clanes.';
  end if;
  return new;
end $$;

drop trigger if exists ed26_calicas_clan_members_max on public.ed26_calicas_clan_members;
create trigger ed26_calicas_clan_members_max
  before insert on public.ed26_calicas_clan_members
  for each row execute function public.ed26_calicas_check_max_clans();

alter table public.ed26_calicas_clans         enable row level security;
alter table public.ed26_calicas_clan_members  enable row level security;

do $$ begin
  create policy ed26_calicas_clans_all     on public.ed26_calicas_clans         for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ed26_calicas_clan_mem_all  on public.ed26_calicas_clan_members  for all using (true) with check (true);
exception when duplicate_object then null; end $$;

alter publication supabase_realtime add table public.ed26_calicas_clans;
alter publication supabase_realtime add table public.ed26_calicas_clan_members;
