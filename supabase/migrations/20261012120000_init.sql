-- Chase: one account, two devices. The scheduler reads due rows with the service role.

create table if not exists public.chases (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  job_label text,
  template text not null check (template in ('signature', 'mail', 'redlines', 'blank')),
  stage_labels jsonb,
  stage text not null check (stage in ('do_it', 'confirm_sent', 'waiting', 'confirm_back', 'done')),
  stage_entered_at timestamptz not null default now(),
  do_it_at timestamptz,
  confirm_sent_mode text not null default 'next_morning' check (confirm_sent_mode in ('next_morning', 'delay_hours')),
  confirm_sent_delay_hours integer not null default 16,
  morning_hour integer not null default 8,
  waiting_check_at timestamptz,
  expected_back_at timestamptz,
  confirm_back_repeat_hours integer not null default 24,
  snooze_until timestamptz,
  last_nudge_key text,
  waiting_check_fired boolean not null default false,
  next_nudge_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chases_user_idx on public.chases (user_id, updated_at desc);
create index if not exists chases_due_idx on public.chases (next_nudge_at) where stage <> 'done';

create table if not exists public.nudge_log (
  id uuid primary key default gen_random_uuid(),
  chase_id uuid not null references public.chases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stage text not null,
  body text not null,
  nudge_key text not null,
  fired_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.chases enable row level security;
alter table public.nudge_log enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own chases" on public.chases
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own nudge log" on public.nudge_log
  for select
  using (auth.uid() = user_id);

create policy "own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.chases to authenticated;
grant select on public.nudge_log to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chases'
     ) then
    alter publication supabase_realtime add table public.chases;
  end if;
end $$;
