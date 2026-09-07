-- Run once in the Supabase SQL Editor for an existing Handspeak database.
-- Allows teacher-created quizzes and student attempts backed by the word-sign model.

alter table public.quizzes
  drop constraint if exists quizzes_quiz_type_check;

alter table public.quizzes
  add constraint quizzes_quiz_type_check
  check (quiz_type in ('alphabet', 'spelling', 'word_sign'));

alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_quiz_type_check;

alter table public.quiz_attempts
  add constraint quiz_attempts_quiz_type_check
  check (quiz_type in ('alphabet', 'spelling', 'word_sign'));
