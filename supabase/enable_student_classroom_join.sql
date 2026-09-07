-- Run once in the Supabase SQL Editor for existing projects.
-- Lets a signed-in student join a teacher classroom using its room code.

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
