-- Voice Script Builder: schema, Row Level Security, storage policies.
-- Run once in the Supabase SQL Editor (Free project). Safe to read top to bottom.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','cast')),
  display_name text not null check (char_length(display_name) between 1 and 50),
  color text not null default '#0f6b6b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  unique (project_id, user_id)
);

create table public.backing_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 100),
  mime_type text not null,
  created_at timestamptz not null default now()
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  source_name text not null check (char_length(source_name) between 1 and 255),
  source_text text not null check (octet_length(source_text) <= 200000),
  created_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position int not null default 0,
  title text not null check (char_length(title) between 1 and 100),
  body text not null default '' check (char_length(body) <= 20000),
  script_id uuid references public.scripts(id) on delete set null,
  script_position int,
  assignee_id uuid references public.members(id) on delete set null,  -- one person per section
  backing_track_id uuid references public.backing_tracks(id) on delete set null,
  kind text not null default 'section' check (kind in ('section','pause')),   -- more kinds can be added later
  pause_ms int check (pause_ms is null or pause_ms between 100 and 60000),
  constraint pause_has_length check (kind <> 'pause' or pause_ms is not null),
  constraint script_section_position check (script_id is null or (script_position is not null and script_position >= 0))
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  duration_ms int not null check (duration_ms between 1 and 180000),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
-- Old takes are kept; only one take per section may be current.
create unique index one_current_take on public.recordings(section_id) where is_current;

create table public.invites (   -- no client policies: only reachable through the functions below
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code_hash bytea not null unique,
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Helper functions (security definer avoids recursive RLS) ----------
create function public.is_member(pid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.members where project_id = pid and user_id = auth.uid());
$$;

create function public.is_owner(pid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.members
                 where project_id = pid and user_id = auth.uid() and role = 'owner');
$$;

-- Owner, or the person the section is assigned to.
create function public.can_record(sid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.sections s
    left join public.members m on m.id = s.assignee_id
    where s.id = sid and s.kind = 'section' and (public.is_owner(s.project_id) or m.user_id = auth.uid())
  );
$$;

-- ---------- Triggers ----------
create function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (project_id, user_id, role, display_name)
  select new.id, new.owner_id, 'owner',
         left(coalesce(nullif(split_part(u.email, '@', 1), ''), 'Owner'), 50)
  from auth.users u where u.id = new.owner_id;
  return new;
end $$;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_owner_member();

create function public.check_section_refs() returns trigger
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
create trigger sections_check_refs before insert or update on public.sections
  for each row execute function public.check_section_refs();

-- ---------- Row Level Security ----------
alter table public.projects       enable row level security;
alter table public.members        enable row level security;
alter table public.backing_tracks enable row level security;
alter table public.scripts        enable row level security;
alter table public.sections       enable row level security;
alter table public.recordings     enable row level security;
alter table public.invites        enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_owner(id));

create policy members_select on public.members for select to authenticated
  using (public.is_member(project_id));
create policy members_update on public.members for update to authenticated
  using (user_id = auth.uid() or public.is_owner(project_id));
create policy members_delete on public.members for delete to authenticated   -- leave, or owner removes cast
  using (role = 'cast' and (user_id = auth.uid() or public.is_owner(project_id)));
-- Members are created only by the owner trigger and redeem_invite().
revoke update on public.members from authenticated;
grant update (display_name, color) on public.members to authenticated;

create policy sections_select on public.sections for select to authenticated
  using (public.is_member(project_id));
create policy sections_write on public.sections for all to authenticated
  using (public.is_owner(project_id)) with check (public.is_owner(project_id));

create policy backing_select on public.backing_tracks for select to authenticated
  using (public.is_member(project_id));
create policy backing_write on public.backing_tracks for all to authenticated
  using (public.is_owner(project_id)) with check (public.is_owner(project_id));

create policy scripts_select on public.scripts for select to authenticated
  using (public.is_member(project_id));
revoke all on public.scripts from public, anon, authenticated;
grant select on public.scripts to authenticated;

create policy recordings_select on public.recordings for select to authenticated
  using (public.is_member(project_id));
create policy recordings_delete on public.recordings for delete to authenticated
  using (public.is_owner(project_id) or uploader_id = auth.uid());
-- Takes are created only through save_take(), which flips the old take atomically.
revoke insert, update on public.recordings from authenticated;

-- ---------- Invites and takes (RPC) ----------
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


create function public.redeem_invite(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
  palette text[] := array['#0f6b6b','#b4531a','#5b4b9a','#2f7d32','#a3345a','#1f5f99','#8a6d00','#6b6b6b'];
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites
   where code_hash = extensions.digest(upper(trim(p_code)), 'sha256')
     and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Invite code is invalid, used, or expired'; end if;
  if exists (select 1 from public.members where project_id = inv.project_id and user_id = auth.uid()) then
    raise exception 'You are already in this project';
  end if;
  select count(*) into n from public.members where project_id = inv.project_id;
  insert into public.members (project_id, user_id, role, display_name, color)
  values (inv.project_id, auth.uid(), 'cast',
          left(coalesce(nullif(trim(p_name), ''), 'Cast member'), 50), palette[1 + n % 8]);
  update public.invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return inv.project_id;
end $$;

create function public.save_take(p_section uuid, p_path text, p_mime text, p_duration int, p_size int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid; rid uuid;
begin
  select project_id into pid from public.sections where id = p_section;
  if pid is null or not public.can_record(p_section) then
    raise exception 'You cannot record this section';
  end if;
  if split_part(p_path, '/', 1) <> pid::text or split_part(p_path, '/', 2) <> p_section::text then
    raise exception 'Invalid storage path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'recordings' and name = p_path) then
    raise exception 'Upload not found; try saving again';
  end if;
  update public.recordings set is_current = false where section_id = p_section and is_current;
  insert into public.recordings (section_id, project_id, uploader_id, storage_path, mime_type, duration_ms, size_bytes)
  values (p_section, pid, auth.uid(), p_path, p_mime, p_duration, p_size)
  returning id into rid;
  return rid;
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

revoke execute on function public.create_invite(uuid, int), public.list_invites(uuid), public.revoke_invite(uuid),
  public.redeem_invite(text, text), public.save_take(uuid, text, text, int, int),
  public.import_script(uuid, text, text, text, text[]) from public, anon;
grant execute on function public.create_invite(uuid, int), public.list_invites(uuid), public.revoke_invite(uuid),
  public.redeem_invite(text, text), public.save_take(uuid, text, text, int, int),
  public.import_script(uuid, text, text, text, text[]) to authenticated;

create or replace function public.update_section_text(p_section uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_record(p_section) then raise exception 'You cannot edit this section'; end if;
  if char_length(p_body) > 20000 then raise exception 'That text is too long'; end if;
  update public.sections set body = p_body where id = p_section;
  update public.recordings set is_current = false where section_id = p_section and is_current;
end $$;

revoke execute on function public.update_section_text(uuid, text) from public, anon;
grant execute on function public.update_section_text(uuid, text) to authenticated;

-- ---------- Private storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('recordings', 'recordings', false, 5242880,
   array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a']),
  ('backing', 'backing', false, 20971520,
   array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a'])
on conflict (id) do nothing;

-- Recording paths: {project_id}/{section_id}/{file}.  Backing paths: {project_id}/{file}.
create policy rec_read on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy rec_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and public.can_record(((storage.foldername(name))[2])::uuid));
create policy rec_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and
         (public.is_owner(((storage.foldername(name))[1])::uuid) or owner_id = auth.uid()::text));

create policy backing_read on storage.objects for select to authenticated
  using (bucket_id = 'backing' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy backing_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'backing' and public.is_owner(((storage.foldername(name))[1])::uuid));
create policy backing_delete on storage.objects for delete to authenticated
  using (bucket_id = 'backing' and public.is_owner(((storage.foldername(name))[1])::uuid));
