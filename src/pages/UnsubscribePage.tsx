import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { unsubscribeNewsletter } from '../api/newsletters';
import './AuthPage.css';

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    unsubscribeNewsletter(token)
      .then(() => setSuccess(true))
      .catch(() => setSuccess(false))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Unsubscribing...</h1>
          <p>Please wait.</p>
        </div>
      </div>
    );
  }

  if (!token || !success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Unsubscribe Failed</h1>
          <p>This unsubscribe link is invalid.</p>
          <Link to="/" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Unsubscribed</h1>
        <p>You've been unsubscribed from Selah Photography Club newsletters.</p>
        <Link to="/" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
