-- Run once in the Supabase SQL Editor for existing projects.
-- Expose only teacher names for classrooms the caller belongs to.
create or replace function public.get_my_teacher_names()
returns table (teacher_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role = 'teacher'
    and (p.id = auth.uid() or exists (
      select 1 from public.classrooms c
      join public.classroom_members cm on cm.classroom_id = c.id
      where c.teacher_id = p.id and cm.student_id = auth.uid()
    ));
$$;
revoke all on function public.get_my_teacher_names() from public;
grant execute on function public.get_my_teacher_names() to authenticated;
