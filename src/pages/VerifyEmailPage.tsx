import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import './AuthPage.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

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
          <Link to="/login" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Go to Log In
          </Link>
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
