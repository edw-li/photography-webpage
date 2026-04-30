import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Hero from '../components/Hero';
import About from '../components/About';
import ContestSection from '../components/ContestSection';
import Gallery from '../components/Gallery';
import Events from '../components/Events';
import Newsletter from '../components/Newsletter';
import Members from '../components/Members';
import Contact from '../components/Contact';
import Footer from '../components/Footer';
import { scrollToSection } from '../utils/scrollToSection';
import { useScrollReveal } from '../hooks/useScrollReveal';

export default function HomePage() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const location = useLocation();

  // Handle cross-page scroll-to-section navigation and direct hash links
  useEffect(() => {
    const state = location.state as { scrollTo?: string } | null;
    if (state?.scrollTo) {
      // Small delay to ensure DOM is ready after navigation
      setTimeout(() => {
        scrollToSection(state.scrollTo!);
      }, 100);
      // Clear the state so it doesn't re-scroll on re-render
      window.history.replaceState({}, '');
    } else if (location.hash) {
      setTimeout(() => {
        const id = location.hash.replace('#', '');
        scrollToSection(id);
      }, 100);
    }
  }, [location.state, location.hash]);

  useScrollReveal();

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > window.innerHeight);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Hero />
      <About />
      <ContestSection />
      <Gallery />
      <Events />
      <Newsletter />
      <Members />
      <Contact />
      <Footer />
      <button
        className={`back-to-top${showBackToTop ? ' back-to-top--visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Back to top"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </>
  );
}
