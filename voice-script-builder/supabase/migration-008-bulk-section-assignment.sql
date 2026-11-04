-- Run once in the SQL Editor for existing installs. Fresh installs get this from schema.sql.
create function public.assign_sections(p_project uuid, p_member uuid, p_sections uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare matched int; assigned int;
begin
  if not public.is_owner(p_project) then raise exception 'Only the project owner can assign sections'; end if;
  if not exists (
    select 1 from public.members where id = p_member and project_id = p_project and role = 'cast'
  ) then raise exception 'Choose a cast member in this project'; end if;
  if p_sections is null or cardinality(p_sections) = 0 or exists (
    select 1 from unnest(p_sections) as selected(section_id) where section_id is null
  ) then raise exception 'Select at least one section'; end if;
  select count(*) into matched from public.sections
  where project_id = p_project and kind = 'section' and id = any(p_sections);
  if matched <> cardinality(p_sections) then raise exception 'One or more selected sections are invalid'; end if;

  update public.sections set assignee_id = p_member
  where project_id = p_project and kind = 'section' and id = any(p_sections);
  get diagnostics assigned = row_count;
  return assigned;
end $$;

revoke execute on function public.assign_sections(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.assign_sections(uuid, uuid, uuid[]) to authenticated;
