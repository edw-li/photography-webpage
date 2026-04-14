import { Link } from 'react-router-dom';

export default function ContestSection() {
  return (
    <section id="contest" className="section" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="container fade-in-up">
        <div className="section-title">
          <h2>Monthly Photography Contest</h2>
          <p>Push your creativity, join the challenge, and take some photos!</p>
        </div>
        
        <div style={{ maxWidth: '800px', margin: '0 auto', fontSize: '1.05rem', lineHeight: '1.7' }}>
          <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem', fontSize: '1.5rem' }}>What is the monthly contest?</h3>
          <p style={{ marginBottom: '1rem' }}>
            Every month, we select a photography "theme" and a “bonus challenge.” Everyone is invited to take photos throughout the month that fit the theme and/or bonus challenge. You’ll be able to submit up to 3 photos per contest. At the start of the next month, all members have the opportunity to vote for 1) Your favorite photo, 2) The photo that best fits the monthly theme, and 3) The photo that stepped up to the bonus challenge! The winners with the most votes in each category will be recognized on our website!
          </p>

          <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem', fontSize: '1.5rem' }}>How can you join the contest?</h3>
          <p style={{ marginBottom: '2rem' }}>
            Joining is very easy. Simply register and create an account! Once you do that, you'll be able to submit photos and vote! Check out the <Link to="/contest">Contest page</Link> for more details!
          </p>

          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link to="/contest" className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}>
              Go to Current Contest
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
