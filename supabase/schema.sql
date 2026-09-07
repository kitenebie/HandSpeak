-- Handspeak multi-teacher classroom schema. Run in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  invite_code text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null,
  join_code text not null unique,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, student_id)
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  quiz_type text not null check (quiz_type in ('alphabet', 'spelling', 'word_sign')),
  question_count integer not null check (question_count between 1 and 26),
  settings jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  available_from timestamptz,
  available_until timestamptz,
  created_at timestamptz not null default now(),
  check (available_until is null or available_from is null or available_until > available_from)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references public.quizzes(id) on delete set null,
  classroom_id uuid references public.classrooms(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  quiz_type text not null check (quiz_type in ('alphabet', 'spelling', 'word_sign')),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0),
  accuracy numeric(5,2) not null check (accuracy between 0 and 100),
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('in_progress', 'submitted')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz default now()
);

create table if not exists public.classroom_materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  material_type text not null check (material_type in ('learning', 'practice')),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  settings jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.prevent_duplicate_quiz_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.quiz_id is not null and exists (
    select 1 from public.quiz_attempts
    where quiz_id = new.quiz_id and student_id = new.student_id
  ) then
    raise exception 'This quiz has already been taken.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_quiz_attempt on public.quiz_attempts;
create trigger prevent_duplicate_quiz_attempt
before insert on public.quiz_attempts
for each row execute function public.prevent_duplicate_quiz_attempt();

-- Compatibility for the earlier single-teacher draft schema.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student', 'teacher', 'admin'));
alter table public.quizzes add column if not exists classroom_id uuid references public.classrooms(id) on delete cascade;
alter table public.quiz_attempts add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'));
$$;

create or replace function public.is_current_user_classroom_member(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classroom_members where classroom_id = target_classroom_id and student_id = auth.uid());
$$;

create or replace function public.is_current_user_classroom_teacher(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classrooms where id = target_classroom_id and teacher_id = auth.uid());
$$;

create or replace function public.teacher_can_view_student(target_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classroom_members cm join public.classrooms c on c.id = cm.classroom_id where cm.student_id = target_student_id and c.teacher_id = auth.uid());
$$;

create or replace function public.teacher_can_view_attempt(target_classroom_id uuid, target_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classroom_members cm join public.classrooms c on c.id = cm.classroom_id where cm.classroom_id = target_classroom_id and cm.student_id = target_student_id and c.teacher_id = auth.uid());
$$;

-- Registration assigns student membership from a room code, or teacher access from an admin invite.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invite_record public.teacher_invites%rowtype;
  room_id uuid;
  room_code text := upper(coalesce(new.raw_user_meta_data ->> 'classroom_code', ''));
  entered_invite_code text := upper(coalesce(new.raw_user_meta_data ->> 'teacher_invite_code', ''));
  display_name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  generated_room_code text;
begin
  select * into invite_record from public.teacher_invites
    where lower(email) = lower(new.email) and invite_code = entered_invite_code and used_at is null;

  if found then
    insert into public.profiles (id, full_name, email, role) values (new.id, coalesce(nullif(display_name, ''), invite_record.full_name), new.email, 'teacher');
    update public.teacher_invites set used_at = now() where id = invite_record.id;
    generated_room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    insert into public.classrooms (teacher_id, name, join_code)
      values (new.id, coalesce(nullif(invite_record.full_name, ''), 'Teacher') || '''s Room', generated_room_code);
  else
    insert into public.profiles (id, full_name, email, role) values (new.id, display_name, new.email, 'student');
    select id into room_id from public.classrooms where join_code = room_code and is_open = true;
    if room_id is not null then
      insert into public.classroom_members (classroom_id, student_id) values (room_id, new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.validate_registration_code(code text, account_type text, account_email text default '')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if account_type = 'teacher' then
    return exists (select 1 from public.teacher_invites where invite_code = upper(code) and lower(email) = lower(account_email) and used_at is null);
  end if;
  return exists (select 1 from public.classrooms where join_code = upper(code) and is_open = true);
end;
$$;
grant execute on function public.validate_registration_code(text, text, text) to anon, authenticated;

create or replace function public.join_classroom_by_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a classroom.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'student') then
    raise exception 'Only student accounts can join a classroom.';
  end if;
  select id into room_id from public.classrooms
  where join_code = upper(trim(code)) and is_open = true;
  if room_id is null then
    raise exception 'That classroom code is invalid or closed.';
  end if;
  insert into public.classroom_members (classroom_id, student_id)
  values (room_id, auth.uid())
  on conflict (classroom_id, student_id) do nothing;
  return room_id;
end;
$$;
grant execute on function public.join_classroom_by_code(text) to authenticated;

create or replace function public.get_my_available_quizzes()
returns setof public.quizzes language sql stable security definer set search_path = public as $$
  select q.*
  from public.quizzes q
  where q.is_published = true
    and (
      q.teacher_id = auth.uid()
      or exists (
        select 1 from public.classroom_members cm
        where cm.classroom_id = q.classroom_id and cm.student_id = auth.uid()
      )
    )
  order by q.created_at desc;
$$;
grant execute on function public.get_my_available_quizzes() to authenticated;

alter table public.profiles enable row level security;
alter table public.teacher_invites enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.classroom_materials enable row level security;

-- Remove policies from the earlier single-classroom schema before applying room policies.
drop policy if exists "profiles read own or teacher" on public.profiles;
drop policy if exists "students see published quizzes" on public.quizzes;
drop policy if exists "teachers create quizzes" on public.quizzes;
drop policy if exists "teachers update quizzes" on public.quizzes;
drop policy if exists "students see own attempts or teacher" on public.quiz_attempts;

drop policy if exists "profiles read own, room teacher, or admin" on public.profiles;
create policy "profiles read own, room teacher, or admin" on public.profiles for select using (
  auth.uid() = id or public.is_admin() or public.teacher_can_view_student(id)
);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = 'student');
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage teacher invites" on public.teacher_invites;
create policy "admins manage teacher invites" on public.teacher_invites for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members see their classroom" on public.classrooms;
create policy "members see their classroom" on public.classrooms for select using (teacher_id = auth.uid() or public.is_admin() or public.is_current_user_classroom_member(id));
drop policy if exists "teachers update own classroom" on public.classrooms;
create policy "teachers update own classroom" on public.classrooms for update using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());

drop policy if exists "students and room teachers view memberships" on public.classroom_members;
create policy "students and room teachers view memberships" on public.classroom_members for select using (student_id = auth.uid() or public.is_admin() or public.is_current_user_classroom_teacher(classroom_id));

drop policy if exists "room members see published quizzes" on public.quizzes;
create policy "room members see published quizzes" on public.quizzes for select using (teacher_id = auth.uid() or public.is_admin() or (is_published and public.is_current_user_classroom_member(classroom_id)));
drop policy if exists "teachers create room quizzes" on public.quizzes;
create policy "teachers create room quizzes" on public.quizzes for insert with check (public.is_teacher() and public.is_current_user_classroom_teacher(classroom_id));
drop policy if exists "teachers update room quizzes" on public.quizzes;
create policy "teachers update room quizzes" on public.quizzes for update using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());

drop policy if exists "room members see published materials" on public.classroom_materials;
create policy "room members see published materials" on public.classroom_materials for select using (
  teacher_id = auth.uid() or public.is_admin() or (is_published and public.is_current_user_classroom_member(classroom_id))
);
drop policy if exists "teachers create room materials" on public.classroom_materials;
create policy "teachers create room materials" on public.classroom_materials for insert with check (
  public.is_teacher() and teacher_id = auth.uid() and public.is_current_user_classroom_teacher(classroom_id)
);
drop policy if exists "teachers update room materials" on public.classroom_materials;
create policy "teachers update room materials" on public.classroom_materials for update using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());

drop policy if exists "room students and teachers see attempts" on public.quiz_attempts;
create policy "room students and teachers see attempts" on public.quiz_attempts for select using (student_id = auth.uid() or public.is_admin() or public.teacher_can_view_attempt(classroom_id, student_id));
drop policy if exists "students create own attempts" on public.quiz_attempts;
create policy "students create own attempts" on public.quiz_attempts for insert with check (student_id = auth.uid() and (classroom_id is null or public.is_current_user_classroom_member(classroom_id)));
drop policy if exists "students update own attempts" on public.quiz_attempts;
create policy "students update own attempts" on public.quiz_attempts for update using (student_id = auth.uid()) with check (student_id = auth.uid());
