-- Run once in the SQL Editor for existing installs. Fresh installs get this from schema.sql.
-- Restricts section-text edits to project owners; recording permissions are unchanged.
create or replace function public.update_section_text(p_section uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.sections where id = p_section and public.is_owner(project_id)
  ) then raise exception 'Only the project owner can edit this section'; end if;
  if char_length(p_body) > 20000 then raise exception 'That text is too long'; end if;
  update public.sections set body = p_body where id = p_section;
  update public.recordings set is_current = false where section_id = p_section and is_current;
end $$;

revoke execute on function public.update_section_text(uuid, text) from public, anon;
grant execute on function public.update_section_text(uuid, text) to authenticated;
