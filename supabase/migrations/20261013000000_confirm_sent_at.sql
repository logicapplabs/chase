alter table public.chases add column if not exists confirm_sent_at timestamptz;

alter table public.chases drop constraint if exists chases_confirm_sent_mode_check;

alter table public.chases add constraint chases_confirm_sent_mode_check
  check (confirm_sent_mode in ('next_morning', 'delay_hours', 'at'));
