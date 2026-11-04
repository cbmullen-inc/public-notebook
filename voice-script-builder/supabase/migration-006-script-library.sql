-- Run once in the SQL Editor for existing installs. Fresh installs get this from schema.sql.
create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  source_name text not null check (char_length(source_name) between 1 and 255),
  source_text text not null check (octet_length(source_text) <= 200000),
  created_at timestamptz not null default now()
);

alter table public.sections
  add column script_id uuid references public.scripts(id) on delete set null,
  add column script_position int,
  add constraint script_section_position check (script_id is null or (script_position is not null and script_position >= 0));

alter table public.scripts enable row level security;
create policy scripts_select on public.scripts for select to authenticated
  using (public.is_member(project_id));
revoke all on public.scripts from public, anon, authenticated;
grant select on public.scripts to authenticated;

create or replace function public.check_section_refs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and not exists
     (select 1 from public.members where id = new.assignee_id and project_id = new.project_id) then
    raise exception 'Assignee must be a member of this project';
  end if;
  if new.backing_track_id is not null and not exists
     (select 1 from public.backing_tracks where id = new.backing_track_id and project_id = new.project_id) then
    raise exception 'Backing track must belong to this project';
  end if;
  if new.script_id is not null and not exists
     (select 1 from public.scripts where id = new.script_id and project_id = new.project_id) then
    raise exception 'Script must belong to this project';
  end if;
  return new;
end $$;

create function public.import_script(p_project uuid, p_title text, p_source_name text, p_source_text text, p_sections text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid; next_position int; section_number int;
begin
  if not public.is_owner(p_project) then raise exception 'Only the project owner can import scripts'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then raise exception 'Script name must be 1 to 100 characters'; end if;
  if p_source_name is null or char_length(p_source_name) not between 1 and 255 then raise exception 'Script filename must be 1 to 255 characters'; end if;
  if p_source_text is null or octet_length(p_source_text) > 200000 then raise exception 'That script is too large (200 KB max)'; end if;
  if coalesce(cardinality(p_sections), 0) = 0 or exists (
    select 1 from unnest(p_sections) as parts(body) where body is null or char_length(body) not between 1 and 20000
  ) then raise exception 'Each imported section must be 1 to 20,000 characters'; end if;

  select coalesce(max(position) + 1, 0) into next_position from public.sections where project_id = p_project;
  select count(*) into section_number from public.sections where project_id = p_project and kind = 'section';
  insert into public.scripts (project_id, title, source_name, source_text)
  values (p_project, btrim(p_title), p_source_name, p_source_text) returning id into sid;
  insert into public.sections (project_id, position, title, body, script_id, script_position)
  select p_project, (next_position + part.ordinality - 1)::int, 'Section ' || (section_number + part.ordinality),
         part.body, sid, (part.ordinality - 1)::int
  from unnest(p_sections) with ordinality as part(body, ordinality);
  return sid;
end $$;

revoke execute on function public.import_script(uuid, text, text, text, text[]) from public, anon;
grant execute on function public.import_script(uuid, text, text, text, text[]) to authenticated;
