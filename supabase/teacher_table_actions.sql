-- Run this after the base schema to enable teacher edit/delete actions in dashboard tables.

drop policy if exists "teachers update classroom student profiles" on public.profiles;
create policy "teachers update classroom student profiles" on public.profiles for update using (
  public.teacher_can_view_student(id)
) with check (
  role = 'student' and public.teacher_can_view_student(id)
);

drop policy if exists "teachers remove classroom members" on public.classroom_members;
create policy "teachers remove classroom members" on public.classroom_members for delete using (
  public.is_admin() or public.is_current_user_classroom_teacher(classroom_id)
);

create or replace function public.teacher_can_manage_attempt(target_attempt_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.quiz_attempts qa
    left join public.quizzes q on q.id = qa.quiz_id
    left join public.classrooms c on c.id = qa.classroom_id
    where qa.id = target_attempt_id
      and (
        q.teacher_id = auth.uid()
        or c.teacher_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

drop policy if exists "teachers delete room quizzes" on public.quizzes;
create policy "teachers delete room quizzes" on public.quizzes for delete using (
  teacher_id = auth.uid() or public.is_admin()
);

drop policy if exists "teachers update room attempts" on public.quiz_attempts;
create policy "teachers update room attempts" on public.quiz_attempts for update using (
  public.is_admin() or public.teacher_can_view_attempt(classroom_id, student_id) or public.teacher_can_manage_attempt(id)
) with check (
  public.is_admin() or public.teacher_can_view_attempt(classroom_id, student_id) or public.teacher_can_manage_attempt(id)
);

drop policy if exists "teachers delete room attempts" on public.quiz_attempts;
create policy "teachers delete room attempts" on public.quiz_attempts for delete using (
  public.is_admin() or public.teacher_can_view_attempt(classroom_id, student_id) or public.teacher_can_manage_attempt(id)
);
