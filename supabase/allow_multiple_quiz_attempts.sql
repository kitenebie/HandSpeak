-- Allows teachers to choose how many times students can take each quiz.
-- Existing quizzes keep the old single-attempt behavior until edited/recreated.

alter table public.quizzes
  add column if not exists max_attempts integer not null default 1;

alter table public.quizzes
  drop constraint if exists quizzes_max_attempts_check;

alter table public.quizzes
  add constraint quizzes_max_attempts_check check (max_attempts between 1 and 10);

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
