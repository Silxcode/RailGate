-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Stations Table (Read-only for public)
create table stations (
  code text primary key,
  name text not null,
  city text not null,
  state text,
  zone text,
  lat double precision,
  lng double precision,
  created_at timestamp with time zone default now()
);

-- 2. Gates Table (Crowdsourced)
create table gates (
  id uuid primary key default uuid_generate_v4(),
  station_code text references stations(code),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  osm_id text, -- null for manual entries
  status text default 'pending', -- pending, approved, rejected
  verification_count int default 0,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

-- 3. Gate Status Reports (Live status)
create table gate_reports (
  id uuid primary key default uuid_generate_v4(),
  gate_id uuid references gates(id),
  status text not null, -- open, closed
  user_id uuid references auth.users(id), -- nullable for anon
  created_at timestamp with time zone default now()
);

-- 4. Train Delay Reports
create table delay_reports (
  id uuid primary key default uuid_generate_v4(),
  train_number text not null,
  station_code text references stations(code),
  delay_minutes int not null,
  user_id uuid references auth.users(id),
  created_at timestamp with time zone default now()
);

-- 5. User Profiles (Gamification & Admin)
create table profiles (
  id uuid primary key references auth.users(id),
  email text,
  role text default 'user', -- user, admin
  points int default 0,
  level int default 1,
  created_at timestamp with time zone default now()
);

-- Row Level Security (RLS) Setup

-- Enable RLS
alter table stations enable row level security;
alter table gates enable row level security;
alter table gate_reports enable row level security;
alter table delay_reports enable row level security;
alter table profiles enable row level security;

-- Policies

-- Stations: Public read
create policy "Public stations are viewable by everyone" 
  on stations for select using (true);

-- Gates: Public read approved/pending
create policy "Public gates are viewable by everyone" 
  on gates for select using (true);

-- Gates: Authenticated/Anon creation
create policy "Everyone can submit pending gates" 
  on gates for insert with check (true);

-- Gates: Admins can update (approve/reject)
create policy "Admins can update gates" 
  on gates for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Reports: Public read/write
create policy "Public reports viewable" on gate_reports for select using (true);
create policy "Public reports insert" on gate_reports for insert with check (true);
create policy "Public delay reports viewable" on delay_reports for select using (true);
create policy "Public delay reports insert" on delay_reports for insert with check (true);

-- Profiles: Public read (leaderboards), Self update, Admin update
create policy "Public profiles viewable" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Function to handle new user signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper to make first user admin (Run manually if needed)
-- update profiles set role = 'admin' where email = 'your-email@example.com';
