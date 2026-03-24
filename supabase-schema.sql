-- ============================================
-- KREADS PRODUCTION PLANNER — Supabase Schema
-- Copie-colle ce fichier en entier dans le SQL Editor de Supabase, puis clique "Run"
-- ============================================

-- 1. Table des monteurs (référentiel fixe)
create table public.editors (
  id uuid default gen_random_uuid() primary key,
  name text not null default '',
  level text not null default 'confirmed' check (level in ('senior', 'confirmed', 'junior')),
  is_freelance boolean not null default false,
  created_at timestamptz default now()
);

-- 2. Table des clients (référentiel fixe)
create table public.clients (
  id uuid default gen_random_uuid() primary key,
  name text not null default '',
  pack int not null default 1 check (pack in (1, 2, 3)),
  strategist text not null default '',
  created_at timestamptz default now()
);

-- 3. Table des affinités monteur × client
create table public.affinities (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  editor_id uuid not null references public.editors(id) on delete cascade,
  created_at timestamptz default now(),
  unique(client_id, editor_id)
);

-- 4. Disponibilités hebdomadaires des monteurs
create table public.weekly_editor_availability (
  id uuid default gen_random_uuid() primary key,
  week_start date not null, -- Le lundi de la semaine
  editor_id uuid not null references public.editors(id) on delete cascade,
  days_available int not null default 5 check (days_available >= 0 and days_available <= 7),
  created_at timestamptz default now(),
  unique(week_start, editor_id)
);

-- 5. Demandes hebdomadaires des clients
create table public.weekly_client_demands (
  id uuid default gen_random_uuid() primary key,
  week_start date not null, -- Le lundi de la semaine
  client_id uuid not null references public.clients(id) on delete cascade,
  concepts_requested int not null default 0,
  at_risk boolean not null default false,
  quality_required boolean not null default false,
  behind_schedule boolean not null default false,
  has_deadline boolean not null default false,
  deadline_date date,
  rush_day int not null default 0 check (rush_day >= 0 and rush_day <= 5),
  created_at timestamptz default now(),
  unique(week_start, client_id)
);

-- 6. Index pour performance
create index idx_affinities_client on public.affinities(client_id);
create index idx_affinities_editor on public.affinities(editor_id);
create index idx_weekly_editor_week on public.weekly_editor_availability(week_start);
create index idx_weekly_client_week on public.weekly_client_demands(week_start);

-- 7. RLS — Accès ouvert pour toute l'équipe (anon key)
-- Si plus tard tu veux restreindre par rôle, tu peux modifier ces policies
alter table public.editors enable row level security;
alter table public.clients enable row level security;
alter table public.affinities enable row level security;
alter table public.weekly_editor_availability enable row level security;
alter table public.weekly_client_demands enable row level security;

create policy "Accès public editors" on public.editors for all using (true) with check (true);
create policy "Accès public clients" on public.clients for all using (true) with check (true);
create policy "Accès public affinities" on public.affinities for all using (true) with check (true);
create policy "Accès public weekly_editor" on public.weekly_editor_availability for all using (true) with check (true);
create policy "Accès public weekly_client" on public.weekly_client_demands for all using (true) with check (true);
