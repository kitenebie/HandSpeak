-- Fixes the circular RLS policy checks between classrooms and classroom_members.
-- Run this in the Supabase SQL Editor after schema.sql.

create or replace function public.is_current_user_classroom_member(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classroom_members
    where classroom_id = target_classroom_id and student_id = auth.uid()
  );
$$;

create or replace function public.is_current_user_classroom_teacher(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classrooms
    where id = target_classroom_id and teacher_id = auth.uid()
  );
$$;

create or replace function public.teacher_can_view_student(target_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.classroom_members cm
    join public.classrooms c on c.id = cm.classroom_id
    where cm.student_id = target_student_id and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.teacher_can_view_attempt(target_classroom_id uuid, target_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.classroom_members cm
    join public.classrooms c on c.id = cm.classroom_id
    where cm.classroom_id = target_classroom_id
      and cm.student_id = target_student_id
      and c.teacher_id = auth.uid()
  );
$$;

drop policy if exists "profiles read own, room teacher, or admin" on public.profiles;
create policy "profiles read own, room teacher, or admin" on public.profiles for select using (
  auth.uid() = id or public.is_admin() or public.teacher_can_view_student(id)
);

drop policy if exists "members see their classroom" on public.classrooms;
create policy "members see their classroom" on public.classrooms for select using (
  teacher_id = auth.uid() or public.is_admin() or public.is_current_user_classroom_member(id)
);

drop policy if exists "students and room teachers view memberships" on public.classroom_members;
create policy "students and room teachers view memberships" on public.classroom_members for select using (
  student_id = auth.uid() or public.is_admin() or public.is_current_user_classroom_teacher(classroom_id)
);

drop policy if exists "room members see published quizzes" on public.quizzes;
create policy "room members see published quizzes" on public.quizzes for select using (
  teacher_id = auth.uid() or public.is_admin() or (is_published and public.is_current_user_classroom_member(classroom_id))
);

drop policy if exists "teachers create room quizzes" on public.quizzes;
create policy "teachers create room quizzes" on public.quizzes for insert with check (
  public.is_teacher() and public.is_current_user_classroom_teacher(classroom_id)
);

drop policy if exists "room students and teachers see attempts" on public.quiz_attempts;
create policy "room students and teachers see attempts" on public.quiz_attempts for select using (
  student_id = auth.uid() or public.is_admin() or public.teacher_can_view_attempt(classroom_id, student_id)
);

drop policy if exists "students create own attempts" on public.quiz_attempts;
create policy "students create own attempts" on public.quiz_attempts for insert with check (
  student_id = auth.uid() and (classroom_id is null or public.is_current_user_classroom_member(classroom_id))
);
