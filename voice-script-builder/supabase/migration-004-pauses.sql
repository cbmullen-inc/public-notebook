-- Run once in the SQL Editor (existing installs). Fresh installs get this from schema.sql.
-- Script items now have a kind: a normal 'section', or a 'pause' with a length in milliseconds.
-- More kinds can be added later by widening the check.
alter table public.sections
  add column if not exists kind text not null default 'section' check (kind in ('section','pause')),
  add column if not exists pause_ms int check (pause_ms is null or pause_ms between 100 and 60000);
alter table public.sections add constraint pause_has_length check (kind <> 'pause' or pause_ms is not null);

-- Pauses can't be recorded into.
create or replace function public.can_record(sid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.sections s
    left join public.members m on m.id = s.assignee_id
    where s.id = sid and s.kind = 'section' and (public.is_owner(s.project_id) or m.user_id = auth.uid())
  );
$$;
