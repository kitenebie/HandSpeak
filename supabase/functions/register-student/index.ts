import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowedGenders = new Set(['female', 'male', 'other', 'unspecified']);

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
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileError || !['teacher', 'admin'].includes(callerProfile?.role)) {
      throw new Error('Teacher access is required.');
    }

    const { fullName, email, password, gender, classroomId } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(fullName || '').trim();
    const normalizedPassword = String(password || '').trim();
    const normalizedGender = allowedGenders.has(String(gender || '').trim().toLowerCase())
      ? String(gender || '').trim().toLowerCase()
      : 'unspecified';
    if (!normalizedName || !normalizedEmail || normalizedPassword.length < 6) {
      throw new Error('Student name, email, and a password with at least 6 characters are required.');
    }

    let classroomQuery = adminClient
      .from('classrooms')
      .select('id, join_code, teacher_id')
      .eq('id', classroomId);
    if (callerProfile.role !== 'admin') classroomQuery = classroomQuery.eq('teacher_id', user.id);
    const { data: classroom, error: classroomError } = await classroomQuery.single();
    if (classroomError || !classroom) throw new Error('Classroom record was not found.');

    const { data: authResult, error: authError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: normalizedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedName,
        gender: normalizedGender,
        classroom_code: classroom.join_code,
      },
    });
    if (authError) throw authError;

    const studentId = authResult.user?.id;
    if (!studentId) throw new Error('Student account was not created.');
    await adminClient.from('classroom_members').upsert({
      classroom_id: classroom.id,
      student_id: studentId,
    });

    const { data: student, error: studentError } = await adminClient
      .from('profiles')
      .select('id, full_name, email, gender, created_at')
      .eq('id', studentId)
      .single();
    if (studentError) throw studentError;

    return Response.json({ student }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not register student.' }, {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
