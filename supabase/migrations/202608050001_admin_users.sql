create table if not exists public.admin_users (
  roblox_id text primary key check (roblox_id ~ '^[0-9]+$'),
  username text check (username is null or length(username) <= 100),
  added_by text check (added_by is null or added_by ~ '^[0-9]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists admin_users_active_idx on public.admin_users (active, created_at desc);

alter table public.admin_users enable row level security;
