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

const HOMEPAGE_SECTION_ANCHORS = new Set([
  'hero',
  'about',
  'contest',
  'gallery',
  'events',
  'newsletter',
  'subscribe',
  'members',
  'contact',
]);

export default function HomePage() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const location = useLocation();

  // Handle cross-page scroll-to-section navigation
  useEffect(() => {
    const state = location.state as { scrollTo?: string } | null;
    if (state?.scrollTo) {
      // Small delay to ensure DOM is ready after navigation
      setTimeout(() => {
        scrollToSection(state.scrollTo!);
      }, 100);
      // Clear the state so it doesn't re-scroll on re-render
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // Direct URL hash anchors (e.g. landing on /#newsletter from an external
  // link). BrowserRouter delivers the visitor to `/` and ignores the hash;
  // this effect honors whitelisted section hashes by scrolling once the DOM
  // has settled. Unknown hashes fall through silently.
  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    if (!id || !HOMEPAGE_SECTION_ANCHORS.has(id)) return;
    const timer = setTimeout(() => scrollToSection(id), 100);
    return () => clearTimeout(timer);
  }, [location.hash]);

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
