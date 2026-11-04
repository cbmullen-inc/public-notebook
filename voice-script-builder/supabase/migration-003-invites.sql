-- Run once in the SQL Editor (existing installs). Fresh installs get this from schema.sql.
alter table public.invites add column if not exists created_at timestamptz not null default now();

drop function if exists public.create_invite(uuid);
create function public.create_invite(p_project uuid, p_hours int default 168) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  if not public.is_owner(p_project) then raise exception 'Only the owner can create invite codes'; end if;
  code := upper(encode(extensions.gen_random_bytes(5), 'hex'));
  insert into public.invites (project_id, code_hash, created_by, expires_at)
  values (p_project, extensions.digest(code, 'sha256'), auth.uid(),
          now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 168), 720))));
  return code;
end $$;

create function public.list_invites(p_project uuid)
returns table (id uuid, created_at timestamptz, expires_at timestamptz)
language sql security definer stable set search_path = '' as $$
  select i.id, i.created_at, i.expires_at from public.invites i
  where i.project_id = p_project and i.used_at is null and i.expires_at > now()
    and public.is_owner(p_project)
  order by i.created_at desc;
$$;

create function public.revoke_invite(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.invites where id = p_id and used_at is null and public.is_owner(project_id);
$$;

revoke execute on function public.create_invite(uuid, int), public.list_invites(uuid),
  public.revoke_invite(uuid) from public, anon;
grant execute on function public.create_invite(uuid, int), public.list_invites(uuid),
  public.revoke_invite(uuid) to authenticated;
