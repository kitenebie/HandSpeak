-- Run this once in the Supabase SQL Editor for an existing installation.
create table if not exists public.classroom_materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  material_type text not null check (material_type in ('learning', 'practice')),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  settings jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.classroom_materials enable row level security;
drop policy if exists "room members see published materials" on public.classroom_materials;
create policy "room members see published materials" on public.classroom_materials for select using (
  teacher_id = auth.uid() or public.is_admin() or (is_published and public.is_current_user_classroom_member(classroom_id))
);
drop policy if exists "teachers create room materials" on public.classroom_materials;
create policy "teachers create room materials" on public.classroom_materials for insert with check (
  public.is_teacher() and teacher_id = auth.uid() and public.is_current_user_classroom_teacher(classroom_id)
);
drop policy if exists "teachers update room materials" on public.classroom_materials;
create policy "teachers update room materials" on public.classroom_materials for update using (teacher_id = auth.uid() or public.is_admin()) with check (teacher_id = auth.uid() or public.is_admin());
