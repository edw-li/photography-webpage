import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTurnstile } from '../hooks/useTurnstile';
import { resendVerification } from '../api/auth';
import PasswordField from '../components/PasswordField';
import { validatePassword } from '../utils/passwordValidation';
import './AuthPage.css';

const RESEND_COOLDOWN_SECONDS = 30;

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hp, setHp] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { register } = useAuth();
  const { addToast } = useToast();
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { getToken } = useTurnstile(turnstileRef);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !confirm) {
      setError('All fields are required.');
      return;
    }
    if (!validatePassword(password).allMet) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await register(email.trim(), password, firstName.trim(), lastName.trim(), {
        hp,
        turnstileToken: getToken(),
      });
      setSuccessMessage(result.message);
    } catch {
      setError('Registration failed. Email may already be in use.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    try {
      await resendVerification(email.trim());
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      addToast('success', 'Verification email sent. Please check your inbox.');
    } catch {
      addToast('error', 'Failed to send verification email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  if (successMessage) {
    let resendLabel = 'Resend Verification Email';
    if (resending) resendLabel = 'Sending...';
    else if (resendCooldown > 0) resendLabel = `Sent! Resend in ${resendCooldown}s`;

    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Check Your Email</h1>
          <p>
            We sent a verification email to <strong>{email.trim()}</strong>.
          </p>
          <p>Didn't get it? Check your spam folder, or:</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            style={{ width: '100%' }}
          >
            {resendLabel}
          </button>
          <div className="auth-card__footer">
            <Link to="/login">Go to Log In</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Register</h1>
        <p>Join Selah Photography Club</p>
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <div className="auth-card__row">
            <div className="auth-card__field">
              <label htmlFor="reg-first-name">First Name</label>
              <input
                id="reg-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                autoComplete="given-name"
              />
            </div>
            <div className="auth-card__field">
              <label htmlFor="reg-last-name">Last Name</label>
              <input
                id="reg-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="auth-card__field">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@domain.com"
              autoComplete="email"
            />
          </div>
          <PasswordField
            id="reg-password"
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Min. 8 characters"
            showRequirements
            autoComplete="new-password"
          />
          <PasswordField
            id="reg-confirm"
            label="Confirm Password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Repeat password"
            autoComplete="new-password"
          />
          {/* Honeypot */}
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
            <label htmlFor="rg-hp">Company</label>
            <input
              type="text"
              id="rg-hp"
              name="hp_r7m"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              tabIndex={-1}
              autoComplete="nope"
            />
          </div>
          <div ref={turnstileRef} className="auth-card__turnstile" />
          {error && <p className="auth-card__error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <div className="auth-card__footer">
          Already have an account? <Link to="/login">Log In</Link>
        </div>
      </div>
    </div>
  );
}
