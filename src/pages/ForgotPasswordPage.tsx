import { useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';
import { useTurnstile } from '../hooks/useTurnstile';
import './AuthPage.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { getToken } = useTurnstile(turnstileRef);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await forgotPassword(email.trim(), getToken());
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {sent ? (
          <>
            <h1>Check Your Email</h1>
            <p>
              If an account exists for <strong>{email}</strong>, we've sent a
              password reset link. Please check your inbox.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
              Back to Log In
            </Link>
          </>
        ) : (
          <>
            <h1>Forgot Password</h1>
            <p>Enter your email and we'll send you a link to reset your password.</p>
            <form className="auth-card__form" onSubmit={handleSubmit}>
              <div className="auth-card__field">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@domain.com"
                />
              </div>
              <div ref={turnstileRef} className="auth-card__turnstile" />
              {error && <p className="auth-card__error">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
            <div className="auth-card__footer">
              Remember your password? <Link to="/login">Log In</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
