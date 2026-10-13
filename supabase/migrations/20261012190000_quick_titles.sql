create table if not exists public.quick_titles (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quick_titles_user_idx on public.quick_titles (user_id, position);

alter table public.quick_titles enable row level security;

create policy "own titles" on public.quick_titles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.quick_titles to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_titles'
     ) then
    alter publication supabase_realtime add table public.quick_titles;
  end if;
end $$;
