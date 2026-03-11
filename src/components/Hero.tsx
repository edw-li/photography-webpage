import { useEffect, useRef, useState } from 'react';
import './Hero.css';

export default function Hero() {
  const bgRef = useRef<HTMLDivElement>(null);
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.onerror = () => setBgLoaded(true);
    img.src = 'https://picsum.photos/id/1018/1920/1080';
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (prefersReduced || isMobile) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (bgRef.current) {
            bgRef.current.style.transform = `translate3d(0, ${window.scrollY * 0.15}px, 0)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section id="hero" className="hero">
      <div className={`hero__bg${bgLoaded ? ' hero__bg--loaded' : ''}`} ref={bgRef} />
      <div className="hero__overlay" />
      <div className="hero__content container">
        <h1 className="hero__title">Selah Photography</h1>
        <p className="hero__tagline">Capturing Moments, Building Community</p>
        <a href="#contact" className="btn btn-primary hero__cta">
          Join Us
        </a>
      </div>
    </section>
  );
}
