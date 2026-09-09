-- Run this once in the Supabase SQL Editor for existing projects.
-- It enables automatic submission for unfinished quiz attempts.

alter table public.quiz_attempts
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.quiz_attempts
set
  status = coalesce(status, 'submitted'),
  started_at = coalesce(started_at, completed_at, now()),
  updated_at = coalesce(updated_at, completed_at, now());

alter table public.quiz_attempts
  alter column status set default 'submitted',
  alter column status set not null,
  alter column started_at set default now(),
  alter column started_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column completed_at drop not null;

alter table public.quiz_attempts drop constraint if exists quiz_attempts_status_check;
alter table public.quiz_attempts
  add constraint quiz_attempts_status_check check (status in ('in_progress', 'submitted'));

drop policy if exists "students update own attempts" on public.quiz_attempts;
create policy "students update own attempts" on public.quiz_attempts
for update using (student_id = auth.uid()) with check (student_id = auth.uid());

create or replace function public.prevent_duplicate_quiz_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed_attempts integer := 1;
  used_attempts integer := 0;
begin
  if new.quiz_id is not null then
    select coalesce(max_attempts, 1)
      into allowed_attempts
      from public.quizzes
      where id = new.quiz_id;

    select count(*)
      into used_attempts
      from public.quiz_attempts
      where quiz_id = new.quiz_id and student_id = new.student_id;

    if used_attempts >= allowed_attempts then
      raise exception 'This quiz has reached the maximum number of attempts.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_quiz_attempt on public.quiz_attempts;
create trigger prevent_duplicate_quiz_attempt
before insert on public.quiz_attempts
for each row execute function public.prevent_duplicate_quiz_attempt();
