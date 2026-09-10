-- Run once in the Supabase SQL Editor for existing projects.
-- The invitation deletion shares the account deletion transaction: if either
-- fails, both roll back, so a retry never leaves an orphaned invitation.
create or replace function public.delete_teacher_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'teacher' then
    delete from public.teacher_invites
    where lower(email) = lower(old.email);
  end if;
  return old;
end;
$$;

revoke all on function public.delete_teacher_invitation() from public;

drop trigger if exists delete_teacher_invitation on public.profiles;
create trigger delete_teacher_invitation
before delete on public.profiles
for each row execute function public.delete_teacher_invitation();
