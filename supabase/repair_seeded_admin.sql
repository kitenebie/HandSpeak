-- Repairs only the malformed admin account created by the old raw-Auth seed.
-- Run this in the Supabase SQL Editor once.
-- It does NOT affect normal student accounts.

delete from auth.identities
where user_id = '0e0c2ab5-02cc-4e37-b7e8-29da20f72958';

delete from auth.users
where id = '0e0c2ab5-02cc-4e37-b7e8-29da20f72958'
  and email = 'admin@handspeak.local';

-- After this succeeds, create the admin normally in Authentication > Users,
-- then run the role update in seed_admin.sql.
