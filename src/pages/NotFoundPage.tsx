import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontSize: '4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          404
        </h1>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
          Page Not Found
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/" className="btn btn-primary">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
