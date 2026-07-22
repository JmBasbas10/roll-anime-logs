-- Run this migration in the Supabase SQL Editor before enabling ingestion.
create table if not exists public.purchase_logs (
  receipt_id text primary key check (length(receipt_id) between 1 and 200),
  player_id bigint not null check (player_id > 0),
  player_name text check (player_name is null or length(player_name) <= 100),
  product_id bigint not null check (product_id > 0),
  product_name text check (product_name is null or length(product_name) <= 150),
  price_robux integer check (price_robux is null or price_robux between 0 and 10000000),
  purchased_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists purchase_logs_purchased_at_idx on public.purchase_logs (purchased_at desc, receipt_id desc);
create index if not exists purchase_logs_player_id_idx on public.purchase_logs (player_id, purchased_at desc);
create index if not exists purchase_logs_product_id_idx on public.purchase_logs (product_id, purchased_at desc);

create table if not exists public.product_purchase_totals (
  product_id bigint primary key,
  product_name text,
  purchase_count bigint not null default 0 check (purchase_count >= 0),
  robux_total bigint not null default 0 check (robux_total >= 0),
  last_purchased_at timestamptz not null
);

create index if not exists product_purchase_totals_count_idx on public.product_purchase_totals (purchase_count desc, product_id);

create table if not exists public.gift_logs (
  gift_id text primary key check (length(gift_id) between 1 and 200),
  giver_id bigint not null check (giver_id > 0),
  giver_name text check (giver_name is null or length(giver_name) <= 100),
  receiver_id bigint not null check (receiver_id > 0),
  receiver_name text check (receiver_name is null or length(receiver_name) <= 100),
  unit_name text not null check (length(unit_name) between 1 and 150),
  unit_level integer check (unit_level is null or unit_level between 1 and 1000000),
  unit_mutation text check (unit_mutation is null or length(unit_mutation) <= 100),
  unit_trait text check (unit_trait is null or length(unit_trait) <= 100),
  unit_uuid text check (unit_uuid is null or length(unit_uuid) <= 200),
  created_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists gift_logs_created_at_idx on public.gift_logs (created_at desc, gift_id desc);
create index if not exists gift_logs_giver_id_idx on public.gift_logs (giver_id, created_at desc);
create index if not exists gift_logs_receiver_id_idx on public.gift_logs (receiver_id, created_at desc);

alter table public.purchase_logs enable row level security;
alter table public.product_purchase_totals enable row level security;
alter table public.gift_logs enable row level security;

create or replace function public.ingest_purchase_events(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event jsonb;
  inserted_product_id bigint;
  inserted_count integer := 0;
  duplicate_count integer := 0;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then
    raise exception 'p_events must be an array containing at most 100 events';
  end if;

  for event in select value from jsonb_array_elements(p_events)
  loop
    inserted_product_id := null;
    insert into public.purchase_logs (
      receipt_id, player_id, player_name, product_id, product_name,
      price_robux, purchased_at, raw_payload
    ) values (
      event->>'receipt_id', (event->>'player_id')::bigint, event->>'player_name',
      (event->>'product_id')::bigint, event->>'product_name',
      nullif(event->>'price_robux', '')::integer, (event->>'purchased_at')::timestamptz,
      coalesce(event->'raw_payload', '{}'::jsonb)
    )
    on conflict (receipt_id) do nothing
    returning product_id into inserted_product_id;

    if inserted_product_id is null then
      duplicate_count := duplicate_count + 1;
    else
      inserted_count := inserted_count + 1;
      insert into public.product_purchase_totals (product_id, product_name, purchase_count, robux_total, last_purchased_at)
      values (
        inserted_product_id, event->>'product_name', 1,
        coalesce(nullif(event->>'price_robux', '')::bigint, 0),
        (event->>'purchased_at')::timestamptz
      )
      on conflict (product_id) do update set
        product_name = coalesce(excluded.product_name, public.product_purchase_totals.product_name),
        purchase_count = public.product_purchase_totals.purchase_count + 1,
        robux_total = public.product_purchase_totals.robux_total + excluded.robux_total,
        last_purchased_at = greatest(public.product_purchase_totals.last_purchased_at, excluded.last_purchased_at);
    end if;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'duplicates', duplicate_count);
end;
$$;

create or replace function public.ingest_gift_events(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event jsonb;
  inserted_id text;
  inserted_count integer := 0;
  duplicate_count integer := 0;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then
    raise exception 'p_events must be an array containing at most 100 events';
  end if;

  for event in select value from jsonb_array_elements(p_events)
  loop
    inserted_id := null;
    insert into public.gift_logs (
      gift_id, giver_id, giver_name, receiver_id, receiver_name,
      unit_name, unit_level, unit_mutation, unit_trait, unit_uuid,
      created_at, raw_payload
    ) values (
      event->>'gift_id', (event->>'giver_id')::bigint, event->>'giver_name',
      (event->>'receiver_id')::bigint, event->>'receiver_name',
      event->>'unit_name', nullif(event->>'unit_level', '')::integer,
      event->>'unit_mutation', event->>'unit_trait', event->>'unit_uuid',
      (event->>'created_at')::timestamptz, coalesce(event->'raw_payload', '{}'::jsonb)
    )
    on conflict (gift_id) do nothing
    returning gift_id into inserted_id;

    if inserted_id is null then duplicate_count := duplicate_count + 1;
    else inserted_count := inserted_count + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'duplicates', duplicate_count);
end;
$$;

revoke all on function public.ingest_purchase_events(jsonb) from public, anon, authenticated;
revoke all on function public.ingest_gift_events(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_purchase_events(jsonb) to service_role;
grant execute on function public.ingest_gift_events(jsonb) to service_role;
