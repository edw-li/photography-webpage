import './Hero.css';

export default function Hero() {
  return (
    <section id="hero" className="hero">
      <div className="hero__overlay" />
      <div className="hero__content container">
        <h1 className="hero__title">Bridgeway Photography</h1>
        <p className="hero__tagline">Capturing Moments, Building Community</p>
        <a href="#contact" className="btn btn-primary hero__cta">
          Join Us
        </a>
      </div>
    </section>
  );
}
