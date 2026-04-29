import { useState, useEffect, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail, resendVerification } from '../api/auth';
import { useToast } from '../contexts/ToastContext';
import './AuthPage.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    verifyEmail(token)
      .then(() => setSuccess(true))
      .catch(() => setSuccess(false))
      .finally(() => setLoading(false));
  }, [token]);

  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    const email = resendEmail.trim();
    if (!email) return;
    setResending(true);
    setResendError('');
    try {
      await resendVerification(email);
      setResent(true);
      addToast('success', 'Verification email sent. Please check your inbox.');
    } catch {
      setResendError('Failed to send verification email. Please try again.');
      addToast('error', 'Failed to send verification email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Verifying...</h1>
          <p>Please wait while we verify your email address.</p>
        </div>
      </div>
    );
  }

  if (!token || !success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Verification Failed</h1>
          <p>This verification link is invalid or has already been used.</p>
          {resent ? (
            <p>
              If an account exists for <strong>{resendEmail}</strong>, a new
              verification link has been sent. Please check your inbox
              (including spam).
            </p>
          ) : (
            <form className="auth-card__form" onSubmit={handleResend}>
              <div className="auth-card__field">
                <label htmlFor="resend-email">Email</label>
                <input
                  id="resend-email"
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="example@domain.com"
                  autoComplete="email"
                />
              </div>
              {resendError && <p className="auth-card__error">{resendError}</p>}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={resending || !resendEmail.trim()}
              >
                {resending ? 'Sending...' : 'Send verification email'}
              </button>
            </form>
          )}
          <div className="auth-card__footer">
            Already verified? <Link to="/login">Log In</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Email Verified</h1>
        <p>Your email has been verified! You can now log in.</p>
        <Link to="/login" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
          Log In
        </Link>
      </div>
    </div>
  );
}
