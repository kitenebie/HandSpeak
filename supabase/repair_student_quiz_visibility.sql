-- Run once in the Supabase SQL Editor for existing projects.
-- Securely returns published quizzes available to the current student's classroom.

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
