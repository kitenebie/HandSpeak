import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const allowedGenders = new Set(['female', 'male', 'other', 'unspecified']);
// This must also be allow-listed in Supabase Auth > URL Configuration.
const inviteRedirectUrl = Deno.env.get('INVITE_REDIRECT_URL')
  || 'https://goldenrod-wren-935596.hostingersite.com';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization token.');

    const projectUrl = Deno.env.get('SUPABASE_URL')!;
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(projectUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) throw new Error('You must be signed in.');

    const adminClient = createClient(projectUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: adminProfile, error: profileError } = await adminClient
      .from('profiles').select('role').eq('id', user.id).single();
    if (profileError || adminProfile?.role !== 'admin') throw new Error('Administrator access is required.');

    const { fullName, email, inviteCode, gender } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCode = String(inviteCode || '').trim().toUpperCase();
    const normalizedName = String(fullName || '').trim();
    const normalizedGender = allowedGenders.has(String(gender || '').trim().toLowerCase())
      ? String(gender || '').trim().toLowerCase()
      : 'unspecified';
    if (!normalizedName || !normalizedEmail || !normalizedCode) throw new Error('Teacher name, email, and invitation code are required.');

    const { data: invite, error: inviteError } = await adminClient.from('teacher_invites').insert({
      full_name: normalizedName,
      email: normalizedEmail,
      invite_code: normalizedCode,
      invited_by: user.id,
    }).select().single();
    if (inviteError) throw inviteError;

    const { error: authError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: { full_name: normalizedName, teacher_invite_code: normalizedCode, gender: normalizedGender },
      redirectTo: inviteRedirectUrl,
    });
    if (authError) {
      await adminClient.from('teacher_invites').delete().eq('id', invite.id);
      throw authError;
    }

    return Response.json({ invite }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not invite teacher.' }, {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
