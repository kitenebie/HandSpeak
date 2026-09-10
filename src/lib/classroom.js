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

export async function signUp({ fullName, email, password, gender = 'unspecified', accountType = 'student', registrationCode }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: {
      full_name: fullName,
      gender,
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

export async function getStudentClassrooms() {
  const session = await getSession();
  if (!session) return [];
  const { data, error } = await supabase.from('classroom_members')
    .select('classrooms(id, name, join_code, teacher_id, is_open)')
    .eq('student_id', session.user.id);
  if (error) throw error;
  return (data || []).map(item => item.classrooms).filter(Boolean);
}

export async function joinClassroomsByCodes(value) {
  const codes = [...new Set(String(value || '').toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  if (!codes.length) throw new Error('Enter at least one room code.');
  if (codes.length > 20) throw new Error('Enter up to 20 room codes at a time.');
  const results = [];
  for (const code of codes) {
    try {
      const roomId = await joinClassroomByCode(code);
      results.push({ code, roomId });
    } catch (error) {
      results.push({ code, error: error.message || 'Could not join this room.' });
    }
  }
  return results;
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

export async function getMyTeacherNames() {
  const { data, error } = await supabase.rpc('get_my_teacher_names');
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
    .select('*, classrooms(name)').eq('is_published', true).order('created_at', { ascending: false });
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

export async function registerStudent({ fullName, email, password, gender, classroomId }) {
  const { data, error } = await supabase.functions.invoke('register-student', {
    body: { fullName, email, password, gender, classroomId }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.student;
}

export async function updateQuiz(quizId, updates) {
  const { data, error } = await supabase.from('quizzes')
    .update(updates)
    .eq('id', quizId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuiz(quizId) {
  const { error: attemptsError } = await supabase.from('quiz_attempts').delete().eq('quiz_id', quizId);
  if (attemptsError) throw attemptsError;
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  if (error) throw error;
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

export async function updateAttemptScore(attemptId, { score, maxScore }) {
  const accuracy = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const { data, error } = await supabase.from('quiz_attempts').update({
    score,
    max_score: maxScore,
    accuracy,
    updated_at: new Date().toISOString()
  }).eq('id', attemptId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAttempt(attemptId) {
  const { error } = await supabase.from('quiz_attempts').delete().eq('id', attemptId);
  if (error) throw error;
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
    .select('student_id, joined_at, profiles!classroom_members_student_id_fkey(id, full_name, email, gender, created_at)')
    .order('joined_at');
  if (error) throw error;
  return (data || []).map(item => ({ ...item.profiles, joined_at: item.joined_at }));
}

export async function updateTeacherProfile(teacherId, { full_name, gender }) {
  const name = String(full_name || '').trim();
  if (!name || name.length > 100) throw new Error('Enter a teacher name of 1–100 characters.');
  if (!['female', 'male', 'other', 'unspecified'].includes(gender)) throw new Error('Select a valid gender.');
  const { data, error } = await supabase.from('profiles')
    .update({ full_name: name, gender })
    .eq('id', teacherId)
    .eq('role', 'teacher')
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTeacher(teacherId) {
  const { data, error } = await supabase.functions.invoke('delete-teacher', {
    body: { teacherId }
  });
  if (error) {
    const detail = await error.context?.json().catch(() => null);
    throw new Error(detail?.error || error.message || 'Could not delete teacher.');
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.deleted) throw new Error('Teacher deletion was not confirmed.');
}

export async function updateStudentProfile(studentId, updates) {
  const payload = {};
  if (Object.hasOwn(updates, 'full_name')) payload.full_name = updates.full_name;
  if (Object.hasOwn(updates, 'gender')) payload.gender = updates.gender;
  const { data, error } = await supabase.from('profiles')
    .update(payload)
    .eq('id', studentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeStudentFromClassroom(classroomId, studentId) {
  const { error } = await supabase.from('classroom_members')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId);
  if (error) throw error;
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

export async function inviteTeacher({ fullName, email, inviteCode, gender = 'unspecified' }) {
  const { data, error } = await supabase.functions.invoke('invite-teacher', {
    body: { fullName, email, inviteCode, gender }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.invite;
}

export async function getAdminTeachers() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, gender, created_at').eq('role', 'teacher').order('full_name');
  if (error) throw error;
  return data || [];
}

export async function getAdminStudents() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, gender, created_at').eq('role', 'student').order('full_name');
  if (error) throw error;
  return data || [];
}

export async function getAdminClassrooms() {
  const { data, error } = await supabase.from('classrooms').select('*, profiles!classrooms_teacher_id_fkey(full_name, email, gender)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAdminQuizzes() {
  const { data, error } = await supabase.from('quizzes').select('*, profiles!quizzes_teacher_id_fkey(full_name, email, gender), classrooms(name, join_code)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAdminMemberships() {
  const { data, error } = await supabase.from('classroom_members').select('classroom_id, student_id, joined_at');
  if (error) throw error;
  return data || [];
}
