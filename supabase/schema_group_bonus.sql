-- =====================================================================
-- BONUS DE GRUPOS (predecir 1ro, 2do y mejor 3ro) + log notificaciones
-- Aplicar luego de schema.sql
-- =====================================================================

create table if not exists public.ed26_calicas_group_picks (
  user_id uuid not null references public.ed26_calicas_users(id) on delete cascade,
  group_letter text not null,
  first_team text not null,
  second_team text not null,
  third_qualifier_team text,
  points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_letter)
);
create index if not exists ed26_calicas_gp_user_idx on public.ed26_calicas_group_picks (user_id);

alter table public.ed26_calicas_group_picks enable row level security;
do $$ begin
  create policy ed26_calicas_gp_all on public.ed26_calicas_group_picks for all using (true) with check (true);
exception when duplicate_object then null; end $$;

create or replace function public.ed26_calicas_check_group_pick_lock()
returns trigger language plpgsql as $$
declare v_lock timestamptz;
begin
  -- Cierre = inicio de los ultimos partidos del grupo (matchday max) - 30 min.
  select min(kickoff_utc) into v_lock
  from public.ed26_calicas_matches
  where group_letter = new.group_letter
    and phase = 'group'
    and matchday = (
      select max(matchday) from public.ed26_calicas_matches
      where group_letter = new.group_letter and phase = 'group'
    );
  if v_lock is null then return new; end if;
  if now() >= (v_lock - interval '30 minutes') then
    raise exception using
      errcode = 'check_violation',
      message = 'El bonus de grupo ya esta cerrado (faltan menos de 30 minutos para los ultimos partidos del grupo).';
  end if;
  return new;
end $$;

drop trigger if exists ed26_calicas_group_picks_lock on public.ed26_calicas_group_picks;
create trigger ed26_calicas_group_picks_lock
  before insert or update of first_team, second_team, third_qualifier_team
  on public.ed26_calicas_group_picks
  for each row execute function public.ed26_calicas_check_group_pick_lock();

alter publication supabase_realtime add table public.ed26_calicas_group_picks;

create table if not exists public.ed26_calicas_notifications_log (
  user_id uuid not null references public.ed26_calicas_users(id) on delete cascade,
  match_id text not null references public.ed26_calicas_matches(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
alter table public.ed26_calicas_notifications_log enable row level security;
do $$ begin
  create policy ed26_calicas_notif_all on public.ed26_calicas_notifications_log for all using (true) with check (true);
exception when duplicate_object then null; end $$;
