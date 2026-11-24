
-- CAMPUSNOTES DATABASE
-- Run this script in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- User roles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'student'
    check (role in ('student', 'admin')),
  created_at timestamptz default now()
);

-- Automatically create a student profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'student');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Resources
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  subject text not null check (char_length(subject) between 1 and 80),
  semester integer not null check (semester between 1 and 8),
  type text not null check (
    type in ('Notes', 'Question Paper', 'Lab', 'Assignment')
  ),
  author text not null check (char_length(author) between 1 and 60),
  storage_path text not null unique,
  user_id uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.resources enable row level security;

-- Admin verification function
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
    and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Profiles: users can read their own profile
create policy "Read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

-- Admin can manage profiles
create policy "Admin manages profiles"
on public.profiles for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Everyone can read approved resources
create policy "Read approved resources"
on public.resources for select
to anon, authenticated
using (status = 'approved');

-- Users can read their own submissions
create policy "Read own submissions"
on public.resources for select
to authenticated
using (user_id = (select auth.uid()));

-- Students can submit resources
create policy "Students submit resources"
on public.resources for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
);

-- Admin can update resources
create policy "Admin moderates resources"
on public.resources for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Admin moderation function
create or replace function public.moderate_resource(
  resource_id uuid,
  new_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if new_status not in ('approved', 'rejected') then
    raise exception 'Invalid moderation status';
  end if;

  update public.resources
  set status = new_status
  where id = resource_id;

  return found;
end;
$$;

revoke all on function public.moderate_resource(uuid, text) from public;
grant execute on function public.moderate_resource(uuid, text)
to authenticated;

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campusnotes-pdfs',
  'campusnotes-pdfs',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do nothing;

-- Authenticated users can upload only to their own folder
create policy "Students upload own PDFs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campusnotes-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = 'pdf'
);

-- Admin can read all uploaded PDFs
create policy "Admin reads PDFs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'campusnotes-pdfs'
  and (select public.is_admin())
);

-- Students can read their own PDFs
create policy "Students read own PDFs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'campusnotes-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Students cannot delete PDFs through the public client.
-- Admins can delete files when necessary.
create policy "Admin deletes PDFs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campusnotes-pdfs'
  and (select public.is_admin())
);
