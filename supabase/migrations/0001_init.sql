-- Foresight — initial schema
-- Conventions:
--   * Every provider-sourced row carries provenance: source, source_timestamp, retrieved_at, confidence, is_projection.
--   * Predictions/snapshots are APPEND-ONLY (enforced by trigger) so they can be backtested.
--   * Reference sports data is world-readable; user/league data is owner-scoped via RLS.
--   * Writes to reference tables happen server-side with the service role (bypasses RLS).

create extension if not exists "pgcrypto";

-- ─── helpers ────────────────────────────────────────────────────────────
create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; insert a new snapshot instead', tg_table_name;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ─── users ──────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_sport text check (default_sport in ('nfl','nba')) default 'nfl',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ─── reference: sports, teams, players ─────────────────────────────────
create table public.sports (
  id text primary key check (id in ('nfl','nba')),
  name text not null
);
insert into public.sports values ('nfl','National Football League'), ('nba','National Basketball Association');

create table public.teams (
  id text primary key,
  sport_id text not null references public.sports(id),
  abbr text not null,
  city text not null,
  name text not null,
  conference text,
  source text not null,
  retrieved_at timestamptz not null default now(),
  unique (sport_id, abbr)
);

create table public.players (
  id text primary key,                       -- internal id
  sport_id text not null references public.sports(id),
  first_name text not null,
  last_name text not null,
  position text not null,
  team_id text references public.teams(id),
  jersey int,
  birth_date date,
  status text not null default 'healthy',
  source text not null,
  retrieved_at timestamptz not null default now()
);
create index players_sport_pos on public.players (sport_id, position);
create index players_team on public.players (team_id);

-- One player, many provider identities.
create table public.player_provider_ids (
  player_id text not null references public.players(id) on delete cascade,
  provider text not null check (provider in ('balldontlie','sleeper','yahoo','sportsdataio','sportradar')),
  external_id text not null,
  match_method text not null check (match_method in ('exact','name_pos_team','name_pos','manual')),
  match_confidence numeric(4,3),
  created_at timestamptz not null default now(),
  primary key (provider, external_id)
);
create index player_provider_ids_player on public.player_provider_ids (player_id);

create table public.games (
  id text primary key,
  sport_id text not null references public.sports(id),
  season int not null,
  week int not null,
  starts_at timestamptz not null,
  home_team_id text not null references public.teams(id),
  away_team_id text not null references public.teams(id),
  status text not null check (status in ('scheduled','live','final')),
  home_score int,
  away_score int,
  source text not null,
  source_timestamp timestamptz,
  retrieved_at timestamptz not null default now()
);
create index games_sport_season_week on public.games (sport_id, season, week);

-- ─── observed stats ────────────────────────────────────────────────────
create table public.player_game_stats (
  player_id text not null references public.players(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  played boolean not null,
  stats jsonb not null,                        -- normalized stat codes (pass_yds, rec, pts, reb, …)
  usage jsonb not null,                        -- opportunity signals kept separate from production
  source text not null,
  source_timestamp timestamptz,
  retrieved_at timestamptz not null default now(),
  primary key (player_id, game_id)
);
create index pgs_game on public.player_game_stats (game_id);

create table public.player_season_stats (
  player_id text not null references public.players(id) on delete cascade,
  season int not null,
  stats jsonb not null,
  source text not null,
  retrieved_at timestamptz not null default now(),
  primary key (player_id, season, source)
);

create table public.player_advanced_stats (
  player_id text not null references public.players(id) on delete cascade,
  season int not null,
  week int,
  category text not null,                      -- rushing / passing / receiving / advanced
  stats jsonb not null,
  source text not null,
  retrieved_at timestamptz not null default now(),
  primary key (player_id, season, category, source, week)
);

-- ─── availability ──────────────────────────────────────────────────────
create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  designation text not null,
  body_part text,
  practice text[],
  minutes_restriction int,
  note text,
  reported_at timestamptz not null,
  source text not null,
  retrieved_at timestamptz not null default now()
);
create index injuries_player_time on public.injuries (player_id, reported_at desc);

create table public.injury_history (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  season int not null,
  body_part text not null,
  games_missed int not null default 0,
  source text not null
);

create table public.depth_charts (
  team_id text not null references public.teams(id),
  position text not null,
  player_id text not null references public.players(id) on delete cascade,
  depth_order int not null,
  source text not null,
  retrieved_at timestamptz not null default now(),
  primary key (team_id, position, player_id, retrieved_at)
);

create table public.lineups (
  game_id text not null references public.games(id) on delete cascade,
  team_id text not null references public.teams(id),
  player_id text not null references public.players(id) on delete cascade,
  is_starter boolean not null,
  source text not null,
  retrieved_at timestamptz not null default now(),
  primary key (game_id, player_id, retrieved_at)
);

-- ─── fantasy context (owner-scoped) ────────────────────────────────────
create table public.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sport_id text not null references public.sports(id),
  provider text not null check (provider in ('sleeper','yahoo','mock')),
  external_league_id text not null,
  name text not null,
  season int not null,
  scoring jsonb not null,
  roster_slots text[] not null,
  playoff_teams int not null default 4,
  created_at timestamptz not null default now(),
  unique (owner_id, provider, external_league_id)
);

create table public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  external_team_id text not null,
  name text not null,
  manager text,
  is_user boolean not null default false,
  wins int not null default 0, losses int not null default 0, ties int not null default 0,
  points_for numeric not null default 0, points_against numeric not null default 0,
  unique (league_id, external_team_id)
);

create table public.fantasy_rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  week int not null,
  retrieved_at timestamptz not null default now(),
  unique (team_id, week, retrieved_at)
);

create table public.fantasy_roster_players (
  roster_id uuid not null references public.fantasy_rosters(id) on delete cascade,
  player_id text not null references public.players(id),
  slot text not null,
  primary key (roster_id, player_id)
);

create table public.fantasy_matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  week int not null,
  home_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  away_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  home_points numeric, away_points numeric
);

create table public.fantasy_transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  external_id text not null,
  type text not null check (type in ('trade','waiver','free_agent','drop')),
  payload jsonb not null,                      -- adds/drops/teams in internal ids
  created_at timestamptz not null,
  unique (league_id, external_id)
);

-- ─── projections & models (append-only) ────────────────────────────────
create table public.projections (           -- latest pointer per player/week (convenience)
  player_id text not null references public.players(id) on delete cascade,
  season int not null,
  week int not null,
  snapshot_id uuid not null,
  primary key (player_id, season, week)
);

create table public.projection_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  season int not null,
  week int not null,
  median numeric not null, floor numeric not null, ceiling numeric not null,
  confidence numeric not null, variance numeric not null, ros_value numeric,
  model_version text not null,
  input_snapshot jsonb,                        -- usage, efficiency, env, matchup factors
  created_at timestamptz not null default now()
);
create index projection_snapshots_lookup on public.projection_snapshots (player_id, season, week, created_at desc);
create trigger projection_snapshots_append_only before update or delete on public.projection_snapshots
  for each row execute function public.forbid_mutation();

create table public.player_values (
  player_id text primary key references public.players(id) on delete cascade,
  value numeric not null, label text not null, tags text[] not null default '{}',
  model_rank int, market_rank int, computed_at timestamptz not null default now()
);
create table public.player_value_history (
  id bigserial primary key,
  player_id text not null references public.players(id) on delete cascade,
  value numeric not null, label text not null, model_rank int, market_rank int,
  computed_at timestamptz not null default now()
);
create trigger player_value_history_append_only before update or delete on public.player_value_history
  for each row execute function public.forbid_mutation();

create table public.opportunity_scores (
  player_id text not null references public.players(id) on delete cascade,
  season int not null, week int not null,
  score int not null, trend text not null, signals jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (player_id, season, week, computed_at)
);
create table public.availability_scores (
  player_id text not null references public.players(id) on delete cascade,
  computed_at timestamptz not null default now(),
  score int not null, play_probability numeric not null, workload text not null, factors jsonb not null,
  primary key (player_id, computed_at)
);
create table public.breakout_scores (
  player_id text not null references public.players(id) on delete cascade,
  computed_at timestamptz not null default now(),
  score int not null, gap int not null, flagged boolean not null,
  primary key (player_id, computed_at)
);
create table public.regression_scores (
  player_id text not null references public.players(id) on delete cascade,
  computed_at timestamptz not null default now(),
  score int not null, label text not null, ratio numeric not null, td_share numeric,
  primary key (player_id, computed_at)
);

-- ─── trades & waivers (owner-scoped) ───────────────────────────────────
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid references public.fantasy_leagues(id) on delete cascade,
  team_a text not null, team_b text not null,
  a_gives text[] not null, b_gives text[] not null,
  created_at timestamptz not null default now()
);
create table public.trade_scenarios (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  style text check (style in ('CONSERVATIVE','BALANCED','AGGRESSIVE')),
  generated_by text not null check (generated_by in ('user','finder','ai')),
  created_at timestamptz not null default now()
);
create table public.trade_results (
  trade_id uuid not null references public.trades(id) on delete cascade,
  computed_at timestamptz not null default now(),
  verdict text not null, fairness int not null, acceptance text not null,
  side_a jsonb not null, side_b jsonb not null, model_version text not null,
  primary key (trade_id, computed_at)
);
create table public.waiver_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid references public.fantasy_leagues(id) on delete cascade,
  player_id text not null references public.players(id),
  drop_player_id text references public.players(id),
  roster_fit int not null, priority text not null, reasons text[] not null,
  created_at timestamptz not null default now()
);

-- ─── research (untrusted input, stored as structured events) ───────────
create table public.research_events (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.players(id) on delete cascade,
  event_type text not null,
  direction text not null check (direction in ('increase','decrease','neutral')),
  confidence numeric(4,3) not null,
  summary text not null,                       -- our paraphrase, never raw page text
  sources jsonb not null,                      -- [{title,url,publisher}]
  occurred_at timestamptz not null,
  provider text not null,
  created_at timestamptz not null default now()
);
create index research_events_player on public.research_events (player_id, occurred_at desc);

-- ─── AI conversations (owner-scoped) ───────────────────────────────────
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sport_id text not null references public.sports(id),
  title text,
  created_at timestamptz not null default now()
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  tool_calls jsonb,                             -- name/args/result trace for provenance
  provider text,
  created_at timestamptz not null default now()
);

-- ─── backtesting (append-only) ─────────────────────────────────────────
create table public.model_predictions (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  player_id text not null references public.players(id) on delete cascade,
  season int not null, week int not null,
  prediction numeric not null, floor numeric, ceiling numeric,
  input_snapshot jsonb,
  predicted_at timestamptz not null default now()
);
create index model_predictions_lookup on public.model_predictions (model_version, season, week);
create trigger model_predictions_append_only before update or delete on public.model_predictions
  for each row execute function public.forbid_mutation();

create table public.model_outcomes (
  prediction_id uuid primary key references public.model_predictions(id),
  actual numeric not null,
  recorded_at timestamptz not null default now()
);

-- ─── Row Level Security ────────────────────────────────────────────────
do $$
declare t text;
begin
  -- world-readable reference & model tables
  foreach t in array array['sports','teams','players','player_provider_ids','games','player_game_stats','player_season_stats',
    'player_advanced_stats','injuries','injury_history','depth_charts','lineups','projections','projection_snapshots',
    'player_values','player_value_history','opportunity_scores','availability_scores','breakout_scores','regression_scores',
    'research_events','model_predictions','model_outcomes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy "profiles_self" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['fantasy_leagues','trades','waiver_recommendations','ai_conversations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_owner" on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)', t, t);
  end loop;
end $$;

-- children inherit access from their owning parent
alter table public.fantasy_teams enable row level security;
create policy "fantasy_teams_owner" on public.fantasy_teams for all using (exists (select 1 from public.fantasy_leagues l where l.id = league_id and l.owner_id = auth.uid()));
alter table public.fantasy_rosters enable row level security;
create policy "fantasy_rosters_owner" on public.fantasy_rosters for all using (exists (select 1 from public.fantasy_teams ft join public.fantasy_leagues l on l.id = ft.league_id where ft.id = team_id and l.owner_id = auth.uid()));
alter table public.fantasy_roster_players enable row level security;
create policy "fantasy_roster_players_owner" on public.fantasy_roster_players for all using (exists (select 1 from public.fantasy_rosters r join public.fantasy_teams ft on ft.id = r.team_id join public.fantasy_leagues l on l.id = ft.league_id where r.id = roster_id and l.owner_id = auth.uid()));
alter table public.fantasy_matchups enable row level security;
create policy "fantasy_matchups_owner" on public.fantasy_matchups for all using (exists (select 1 from public.fantasy_leagues l where l.id = league_id and l.owner_id = auth.uid()));
alter table public.fantasy_transactions enable row level security;
create policy "fantasy_transactions_owner" on public.fantasy_transactions for all using (exists (select 1 from public.fantasy_leagues l where l.id = league_id and l.owner_id = auth.uid()));
alter table public.trade_scenarios enable row level security;
create policy "trade_scenarios_owner" on public.trade_scenarios for all using (exists (select 1 from public.trades t where t.id = trade_id and t.owner_id = auth.uid()));
alter table public.trade_results enable row level security;
create policy "trade_results_owner" on public.trade_results for all using (exists (select 1 from public.trades t where t.id = trade_id and t.owner_id = auth.uid()));
alter table public.ai_messages enable row level security;
create policy "ai_messages_owner" on public.ai_messages for all using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.owner_id = auth.uid()));
