import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  const respond = (body: object, status = 200) => Response.json(body, { status, headers: corsHeaders });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return respond({ error: 'Sign in first.' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return respond({ error: 'Sign in first.' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profileError || profile?.role !== 'admin') return respond({ error: 'Administrator access is required.' }, 403);
    const { teacherId } = await request.json();
    if (typeof teacherId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teacherId)) {
      return respond({ error: 'A valid teacher ID is required.' }, 400);
    }
    const { data: teacher, error: teacherError } = await admin.from('profiles').select('role').eq('id', teacherId).single();
    if (teacherError || teacher?.role !== 'teacher' || teacherId === user.id) return respond({ error: 'Teacher record not found.' }, 404);
    // Removing auth.users cascades to the profile and teacher-owned classroom data.
    // Student profiles and quiz attempts survive under the existing foreign keys.
    const { error } = await admin.auth.admin.deleteUser(teacherId);
    if (error) throw error;
    return respond({ deleted: true });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : 'Could not delete teacher.' }, 400);
  }
});
