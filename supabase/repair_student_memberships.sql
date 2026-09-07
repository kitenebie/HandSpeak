-- Run once in the Supabase SQL Editor.
-- Restores classroom memberships for existing students using the room code
-- saved in their Supabase Auth registration metadata.

insert into public.classroom_members (classroom_id, student_id)
select c.id, p.id
from public.profiles p
join auth.users u on u.id = p.id
join public.classrooms c on c.join_code = upper(trim(coalesce(u.raw_user_meta_data ->> 'classroom_code', '')))
  and c.is_open = true
where p.role = 'student'
on conflict (classroom_id, student_id) do nothing;
