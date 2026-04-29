import { useState, useEffect, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword, validateResetToken } from '../api/auth';
import { ApiError } from '../api/client';
import PasswordField from '../components/PasswordField';
import { validatePassword } from '../utils/passwordValidation';
import './AuthPage.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(!!token);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    validateResetToken(token)
      .then(() => { if (!cancelled) setTokenValid(true); })
      .catch((err) => {
        if (cancelled) return;
        // API 4xx = genuinely invalid/expired; network error = let user try the form
        setTokenValid(err instanceof ApiError ? false : true);
      })
      .finally(() => { if (!cancelled) setValidating(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (!token || tokenValid === false) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invalid Link</h1>
          <p>This password reset link is invalid or has expired.</p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Request a New Link
          </Link>
        </div>
      </div>
    );
  }

  if (validating) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Verifying Link</h1>
          <p>Please wait while we verify your reset link...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validatePassword(password).allMet) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Password Updated</h1>
          <p>Your password has been reset successfully. You can now log in with your new password.</p>
          <Link to="/login" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset Password</h1>
        <p>Enter your new password below.</p>
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <PasswordField
            id="reset-password"
            label="New Password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            showRequirements
            autoComplete="new-password"
          />
          <PasswordField
            id="reset-confirm"
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter your password"
            autoComplete="new-password"
          />
          {error && <p className="auth-card__error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        <div className="auth-card__footer">
          <Link to="/login">Back to Log In</Link>
        </div>
      </div>
    </div>
  );
}
