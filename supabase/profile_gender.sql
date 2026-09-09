-- Adds optional population grouping support for admin and teacher reports.

alter table public.profiles add column if not exists gender text not null default 'unspecified';
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in ('female', 'male', 'other', 'unspecified'));
