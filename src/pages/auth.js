import { isSupabaseConfigured } from '../lib/supabase.js';
import { signIn, signUp, resendConfirmation, validateRegistrationCode } from '../lib/classroom.js';
import { navigate } from '../router.js';

export function mount(container, params) {
  if (!isSupabaseConfigured()) {
    container.innerHTML = '<div class="asl-container"><div class="asl-card">Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY variables, then restart the app.</div></div>';
    return;
  }
  const register = window.location.hash.includes('/auth/register');
  render(container, register);
}

function render(container, register) {
  container.innerHTML = `
    <main class="asl-auth asl-container">
      <section class="asl-auth__card asl-card">
        <div class="asl-auth__mark">🤟</div>
        <h1>${register ? 'Create your account' : 'Welcome back'}</h1>
        <p>${register ? 'Students join their teacher’s room with a room code. Teachers register using an admin invitation code.' : 'Sign in to continue your ASL learning journey.'}</p>
        <form id="auth-form" class="asl-form">
          ${register ? '<label>Account type<select name="accountType" id="account-type"><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label>Full name<input required name="fullName" autocomplete="name" placeholder="Your name"></label><label id="registration-code-label">Teacher room code<input required name="registrationCode" autocomplete="off" placeholder="e.g. A1B2C3" maxlength="16" style="text-transform:uppercase"></label>' : ''}
          <label>Email<input required name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
          <label>Password<input required name="password" type="password" minlength="6" autocomplete="current-password" placeholder="At least 6 characters"></label>
          <div id="auth-message" class="asl-form__message" aria-live="polite"></div>
          <button class="asl-btn asl-btn--primary asl-btn--lg" type="submit">${register ? 'Create account' : 'Sign in'}</button>
        </form>
        <div class="asl-auth__switch">${register ? 'Already have an account?' : 'New student?'} <a href="#/auth/${register ? 'login' : 'register'}">${register ? 'Sign in' : 'Register'}</a></div>
        ${!register ? '<button type="button" class="asl-auth__resend" id="resend-confirmation">Resend confirmation email</button>' : ''}
        ${register ? '<small>An administrator must create a teacher invitation before a teacher can register.</small>' : ''}
      </section>
    </main>`;
  const form = container.querySelector('#auth-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = container.querySelector('#auth-message');
    const button = form.querySelector('button');
    const fields = new FormData(form);
    button.disabled = true;
    message.textContent = '';
    try {
      if (register) {
        const accountType = fields.get('accountType');
        const registrationCode = fields.get('registrationCode').trim().toUpperCase();
        const validCode = await validateRegistrationCode(registrationCode, accountType, fields.get('email'));
        if (!validCode) throw new Error(accountType === 'teacher' ? 'This teacher invitation code does not match the email address.' : 'That teacher room code was not found or is closed.');
        const result = await signUp({ fullName: fields.get('fullName').trim(), email: fields.get('email'), password: fields.get('password'), accountType, registrationCode });
        message.className = 'asl-form__message asl-form__message--success';
        message.textContent = result.session ? 'Account created. Redirecting you to your dashboard…' : 'Check your email to confirm your account, then sign in.';
        if (result.session) setTimeout(() => navigate('#/student'), 600);
      } else {
        await signIn({ email: fields.get('email'), password: fields.get('password') });
        navigate('#/student');
      }
    } catch (error) {
      message.className = 'asl-form__message asl-form__message--error';
      message.textContent = error.message || 'Unable to continue. Please try again.';
    } finally { button.disabled = false; }
  });
  if (register) {
    const accountType = container.querySelector('#account-type');
    const codeLabel = container.querySelector('#registration-code-label');
    accountType.addEventListener('change', () => {
      const isTeacher = accountType.value === 'teacher';
      codeLabel.firstChild.textContent = isTeacher ? 'Teacher invitation code' : 'Teacher room code';
      codeLabel.querySelector('input').placeholder = isTeacher ? 'Invitation code from the administrator' : 'e.g. A1B2C3';
    });
  }
  const resendButton = container.querySelector('#resend-confirmation');
  if (resendButton) {
    const savedNotice = sessionStorage.getItem('authNotice');
    if (savedNotice) {
      const message = container.querySelector('#auth-message');
      message.className = 'asl-form__message asl-form__message--error';
      message.textContent = savedNotice;
      sessionStorage.removeItem('authNotice');
    }
    resendButton.addEventListener('click', async () => {
      const email = form.querySelector('[name="email"]').value.trim();
      const message = container.querySelector('#auth-message');
      if (!email) {
        message.className = 'asl-form__message asl-form__message--error';
        message.textContent = 'Enter your email address first.';
        return;
      }
      resendButton.disabled = true;
      try {
        await resendConfirmation(email);
        message.className = 'asl-form__message asl-form__message--success';
        message.textContent = 'A new confirmation email has been sent. Use only the newest link.';
      } catch (error) {
        message.className = 'asl-form__message asl-form__message--error';
        message.textContent = error.message || 'Could not resend the confirmation email.';
      } finally { resendButton.disabled = false; }
    });
  }
}

export function unmount() {}
