-- Safe administrator setup
--
-- Do NOT insert rows directly into auth.users. Supabase Auth owns that schema,
-- and manual inserts can produce accounts that fail to sign in.
--
-- 1. In Supabase Dashboard, open Authentication > Users > Add user.
-- 2. Create the administrator with the desired email and password.
-- 3. Run this query in the SQL Editor, replacing the email if needed:

update public.profiles
set role = 'admin'
where email = 'admin@handspeak.local';

-- The public.handle_new_user trigger from schema.sql creates the profile row
-- automatically when the Auth user is created in the Dashboard.
    