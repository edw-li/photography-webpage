import { useState, useRef, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTurnstile } from '../hooks/useTurnstile';
import './AuthPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { getToken } = useTurnstile(turnstileRef);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError('');
    try {
      await login(email.trim(), password, { turnstileToken: getToken() });
      addToast('success', 'Logged in successfully');
      navigate('/');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Log In</h1>
        <p>Welcome back to Selah Photography</p>
        <form className="auth-card__form" onSubmit={handleSubmit}>
          <div className="auth-card__field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="auth-card__field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </div>
          <div className="auth-card__forgot">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <div ref={turnstileRef} />
          {error && <p className="auth-card__error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <div className="auth-card__footer">
          Don't have an account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}
