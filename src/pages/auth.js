import { isSupabaseConfigured } from '../lib/supabase.js';
import { requestPasswordReset, resendConfirmation, signIn, signUp, updatePassword, validateRegistrationCode } from '../lib/classroom.js';
import { navigate } from '../router.js';

export function mount(container, params) {
  if (!isSupabaseConfigured()) {
    container.innerHTML = '<div class="FSL-container"><div class="FSL-card">Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY variables, then restart the app.</div></div>';
    return;
  }
  const hash = window.location.hash;
  const mode = hash.includes('/auth/register')
    ? 'register'
    : hash.includes('/auth/forgot-password')
      ? 'forgot-password'
      : hash.includes('/auth/reset-password')
        ? 'reset-password'
        : 'login';
  render(container, mode);
}

function render(container, mode) {
  if (mode === 'forgot-password') {
    renderForgotPassword(container);
    return;
  }
  if (mode === 'reset-password') {
    renderResetPassword(container);
    return;
  }

  const register = mode === 'register';
  container.innerHTML = `
    <main class="FSL-auth FSL-container">
      <section class="FSL-auth__card FSL-card">
        <div class="FSL-auth__mark">🤟</div>
        <h1>${register ? 'Create your account' : 'Welcome back'}</h1>
        <p>${register ? 'Students join their teacher’s room with a room code. Teachers register using an admin invitation code.' : 'Sign in to continue your FSL learning journey.'}</p>
        <form id="auth-form" class="FSL-form">
          ${register ? '<label>Account type<select name="accountType" id="account-type"><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label>Full name<input required name="fullName" autocomplete="name" placeholder="Your name"></label><label>Gender<select name="gender" required><option value="" disabled selected>Select gender</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unspecified">Prefer not to say</option></select></label><label id="registration-code-label">Teacher room code<input required name="registrationCode" autocomplete="off" placeholder="e.g. A1B2C3" maxlength="16" style="text-transform:uppercase"></label>' : ''}
          <label>Email<input required name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
          <label>Password<input required name="password" type="password" minlength="6" autocomplete="${register ? 'new-password' : 'current-password'}" placeholder="At least 6 characters"></label>
          ${!register ? '<div class="FSL-auth__forgot"><a href="#/auth/forgot-password">Forgot password?</a></div>' : ''}
          <div id="auth-message" class="FSL-form__message" aria-live="polite"></div>
          <button class="FSL-btn FSL-btn--primary FSL-btn--lg" type="submit">${register ? 'Create account' : 'Sign in'}</button>
        </form>
        <div class="FSL-auth__switch">${register ? 'Already have an account?' : 'New student?'} <a href="#/auth/${register ? 'login' : 'register'}">${register ? 'Sign in' : 'Register'}</a></div>
        ${!register ? '<button type="button" class="FSL-auth__resend" id="resend-confirmation">Resend confirmation email</button>' : ''}
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
        const result = await signUp({ fullName: fields.get('fullName').trim(), email: fields.get('email'), password: fields.get('password'), gender: fields.get('gender'), accountType, registrationCode });
        message.className = 'FSL-form__message FSL-form__message--success';
        message.textContent = result.session ? 'Account created. Redirecting you to your dashboard…' : 'Check your email to confirm your account, then sign in.';
        if (result.session) setTimeout(() => navigate('#/student'), 600);
      } else {
        await signIn({ email: fields.get('email'), password: fields.get('password') });
        navigate('#/student');
      }
    } catch (error) {
      message.className = 'FSL-form__message FSL-form__message--error';
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
      message.className = 'FSL-form__message FSL-form__message--error';
      message.textContent = savedNotice;
      sessionStorage.removeItem('authNotice');
    }
    resendButton.addEventListener('click', async () => {
      const email = form.querySelector('[name="email"]').value.trim();
      const message = container.querySelector('#auth-message');
      if (!email) {
        message.className = 'FSL-form__message FSL-form__message--error';
        message.textContent = 'Enter your email address first.';
        return;
      }
      resendButton.disabled = true;
      try {
        await resendConfirmation(email);
        message.className = 'FSL-form__message FSL-form__message--success';
        message.textContent = 'A new confirmation email has been sent. Use only the newest link.';
      } catch (error) {
        message.className = 'FSL-form__message FSL-form__message--error';
        message.textContent = error.message || 'Could not resend the confirmation email.';
      } finally { resendButton.disabled = false; }
    });
  }
}

function renderForgotPassword(container) {
  container.innerHTML = `
    <main class="FSL-auth FSL-container">
      <section class="FSL-auth__card FSL-card">
        <div class="FSL-auth__mark">🔑</div>
        <h1>Forgot your password?</h1>
        <p>Enter your account email and we’ll send you a secure password-reset link.</p>
        <form id="forgot-password-form" class="FSL-form">
          <label>Email<input required name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
          <div id="auth-message" class="FSL-form__message" aria-live="polite"></div>
          <button class="FSL-btn FSL-btn--primary FSL-btn--lg" type="submit">Send reset link</button>
        </form>
        <div class="FSL-auth__switch"><a href="#/auth/login">Back to sign in</a></div>
      </section>
    </main>`;

  const form = container.querySelector('#forgot-password-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const message = container.querySelector('#auth-message');
    const email = new FormData(form).get('email').trim();
    button.disabled = true;
    message.textContent = '';
    try {
      await requestPasswordReset(email);
      message.className = 'FSL-form__message FSL-form__message--success';
      message.textContent = 'If an account exists for that email, a password-reset link has been sent.';
    } catch (error) {
      message.className = 'FSL-form__message FSL-form__message--error';
      message.textContent = error.message || 'Could not send the password-reset email.';
    } finally {
      button.disabled = false;
    }
  });
}

function renderResetPassword(container) {
  container.innerHTML = `
    <main class="FSL-auth FSL-container">
      <section class="FSL-auth__card FSL-card">
        <div class="FSL-auth__mark">🔒</div>
        <h1>Create a new password</h1>
        <p>Choose a new password with at least six characters.</p>
        <form id="reset-password-form" class="FSL-form">
          <label>New password<input required name="password" type="password" minlength="6" autocomplete="new-password" placeholder="At least 6 characters"></label>
          <label>Confirm new password<input required name="confirmPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Enter it again"></label>
          <div id="auth-message" class="FSL-form__message" aria-live="polite"></div>
          <button class="FSL-btn FSL-btn--primary FSL-btn--lg" type="submit">Update password</button>
        </form>
        <div class="FSL-auth__switch"><a href="#/auth/login">Back to sign in</a></div>
      </section>
    </main>`;

  const form = container.querySelector('#reset-password-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = new FormData(form);
    const password = fields.get('password');
    const confirmPassword = fields.get('confirmPassword');
    const button = form.querySelector('button');
    const message = container.querySelector('#auth-message');
    message.textContent = '';
    if (password !== confirmPassword) {
      message.className = 'FSL-form__message FSL-form__message--error';
      message.textContent = 'The passwords do not match.';
      return;
    }

    button.disabled = true;
    try {
      await updatePassword(password);
      message.className = 'FSL-form__message FSL-form__message--success';
      message.textContent = 'Your password has been updated. Redirecting to your dashboard…';
      setTimeout(() => navigate('#/student'), 800);
    } catch (error) {
      message.className = 'FSL-form__message FSL-form__message--error';
      message.textContent = error.message || 'This reset link is invalid or expired. Request a new link.';
      button.disabled = false;
    }
  });
}

export function unmount() {}
