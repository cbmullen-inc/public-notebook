-- Run once in the SQL Editor if you already ran the original schema.sql.
-- Lets an account be deleted even if it uploaded takes (its takes are deleted with it).
alter table public.recordings drop constraint recordings_uploader_id_fkey;
alter table public.recordings add constraint recordings_uploader_id_fkey
  foreign key (uploader_id) references auth.users(id) on delete cascade;
