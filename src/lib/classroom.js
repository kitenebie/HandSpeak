import { supabase } from './supabase.js';

let profileCache = null;

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile(force = false) {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) { profileCache = null; return null; }
  if (profileCache && !force) return profileCache;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) throw error;
  profileCache = data;
  return data;
}

export async function signUp({ fullName, email, password, accountType = 'student', registrationCode }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: {
      full_name: fullName,
      ...(accountType === 'teacher' ? { teacher_invite_code: registrationCode } : { classroom_code: registrationCode })
    } }
  });
  if (error) throw error;
  return data;
}

export async function validateRegistrationCode(code, accountType, email = '') {
  const { data, error } = await supabase.rpc('validate_registration_code', {
    code: String(code || '').trim().toUpperCase(),
    account_type: accountType,
    account_email: email
  });
  if (error) throw error;
  return Boolean(data);
}

export async function joinClassroomByCode(code) {
  const { data, error } = await supabase.rpc('join_classroom_by_code', {
    code: String(code || '').trim().toUpperCase()
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  profileCache = null;
  return data;
}

export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(password) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  profileCache = null;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    profileCache = null;
    callback(event);
  });
  return () => subscription.unsubscribe();
}

export async function getPublishedQuizzes() {
  const { data, error } = await supabase.rpc('get_my_available_quizzes');
  if (error) throw error;
  return data || [];
}

export async function getTeacherQuizzes() {
  const { data, error } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getClassroomMaterials() {
  const { data, error } = await supabase.from('classroom_materials')
    .select('*').eq('is_published', true).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTeacherMaterials() {
  const { data, error } = await supabase.from('classroom_materials').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getMyClassroom() {
  const { data, error } = await supabase.from('classrooms').select('*').order('created_at').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createQuiz(quiz) {
  const session = await getSession();
  const { data, error } = await supabase.from('quizzes').insert({ ...quiz, teacher_id: session.user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function createMaterial(material) {
  const session = await getSession();
  const { data, error } = await supabase.from('classroom_materials').insert({
    ...material,
    teacher_id: session.user.id
  }).select().single();
  if (error) throw error;
  return data;
}

export async function saveAttempt({ quizId = null, classroomId = null, quizType, score, maxScore, accuracy, detail = {} }) {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase.from('quiz_attempts').insert({
    student_id: session.user.id,
    quiz_id: quizId,
    classroom_id: classroomId,
    quiz_type: quizType,
    score,
    max_score: maxScore,
    accuracy,
    detail
  }).select().single();
  if (error) throw error;
  return data;
}

export async function startQuizAttempt({ quizId = null, classroomId = null, quizType, maxScore, detail = {} }) {
  const session = await getSession();
  if (!session) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('quiz_attempts').insert({
    quiz_id: quizId,
    classroom_id: classroomId,
    student_id: session.user.id,
    quiz_type: quizType,
    score: 0,
    max_score: maxScore,
    accuracy: 0,
    detail,
    status: 'in_progress',
    started_at: now,
    updated_at: now,
    completed_at: null
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateQuizAttempt(attemptId, { score, maxScore, accuracy, detail = {} }) {
  if (!attemptId) return null;
  const { data, error } = await supabase.from('quiz_attempts').update({
    score,
    max_score: maxScore,
    accuracy,
    detail,
    updated_at: new Date().toISOString()
  }).eq('id', attemptId).select().single();
  if (error) throw error;
  return data;
}

export async function submitQuizAttempt(attemptId, { score, maxScore, accuracy, detail = {} }) {
  if (!attemptId) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('quiz_attempts').update({
    score,
    max_score: maxScore,
    accuracy,
    detail,
    status: 'submitted',
    updated_at: now,
    completed_at: now
  }).eq('id', attemptId).select().single();
  if (error) throw error;
  return data;
}

export async function submitUnfinishedQuizAttempts() {
  const session = await getSession();
  if (!session) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('quiz_attempts').update({
    status: 'submitted',
    updated_at: now,
    completed_at: now
  }).eq('student_id', session.user.id).eq('status', 'in_progress');
  if (error) throw error;
}

export async function getStudentAttempts() {
  const { data, error } = await supabase.from('quiz_attempts')
    .select('*, quizzes(title, max_attempts)')
    .eq('status', 'submitted')
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTeacherStudents() {
  const { data, error } = await supabase.from('classroom_members')
    .select('student_id, joined_at, profiles!classroom_members_student_id_fkey(id, full_name, email, created_at)')
    .order('joined_at');
  if (error) throw error;
  return (data || []).map(item => ({ ...item.profiles, joined_at: item.joined_at }));
}

export async function getTeacherAttempts() {
  const { data, error } = await supabase.from('quiz_attempts')
    .select('*, profiles!quiz_attempts_student_id_fkey(full_name, email), quizzes(title, max_attempts)')
    .eq('status', 'submitted')
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTeacherInvites() {
  const { data, error } = await supabase.from('teacher_invites').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTeacherInvite({ fullName, email, inviteCode }) {
  const session = await getSession();
  const { data, error } = await supabase.from('teacher_invites').insert({
    full_name: fullName,
    email: email.toLowerCase(),
    invite_code: inviteCode.toUpperCase(),
    invited_by: session.user.id
  }).select().single();
  if (error) throw error;
  return data;
}

export async function inviteTeacher({ fullName, email, inviteCode }) {
  const { data, error } = await supabase.functions.invoke('invite-teacher', {
    body: { fullName, email, inviteCode }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.invite;
}

export async function getAdminTeachers() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, created_at').eq('role', 'teacher').order('full_name');
  if (error) throw error;
  return data || [];
}
