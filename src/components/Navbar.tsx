import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { scrollToSection } from '../utils/scrollToSection';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import './Navbar.css';

const sectionLinks = [
  { label: 'Home', id: 'hero' },
  { label: 'About', id: 'about' },
  { label: 'Gallery', id: 'gallery' },
  { label: 'Events', id: 'events' },
  { label: 'Newsletter', id: 'newsletter' },
  { label: 'Members', id: 'members' },
  { label: 'Contact', id: 'contact' },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';

  // IntersectionObserver — only run on home page
  useEffect(() => {
    if (!isHomePage) {
      setActiveSection('');
      return;
    }

    const sections = document.querySelectorAll<HTMLElement>('section[id]');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isHomePage]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNavClick = useCallback(
    (sectionId: string) => {
      setMenuOpen(false);
      if (isHomePage) {
        if (sectionId === 'hero') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          scrollToSection(sectionId);
        }
      } else {
        navigate('/', { state: { scrollTo: sectionId === 'hero' ? undefined : sectionId } });
      }
    },
    [isHomePage, navigate]
  );

  const handleLogoClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuOpen(false);
      if (isHomePage) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate('/');
      }
    },
    [isHomePage, navigate]
  );

  const handleLogout = () => {
    setUserMenuOpen(false);
    setMenuOpen(false);
    logout();
    addToast('success', 'Logged out successfully');
    navigate('/');
  };

  const isContestActive = location.pathname === '/contest';

  return (
    <nav className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        <a href="#" className="navbar__logo" onClick={handleLogoClick}>
          Bridgeway <span>Photography</span>
        </a>

        <button
          className={`navbar__hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>

        <ul className={`navbar__links${menuOpen ? ' navbar__links--open' : ''}`}>
          {sectionLinks.map(({ label, id }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={isHomePage && activeSection === id ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(id);
                }}
              >
                {label}
              </a>
            </li>
          ))}
          <li>
            <Link
              to="/contest"
              className={`navbar__link--accent${isContestActive ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Contest
            </Link>
          </li>
          <li>
            {isAuthenticated ? (
              <div className="navbar__user-menu" ref={userMenuRef}>
                <button
                  className="navbar__user-btn"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  {isAdmin ? 'Welcome, admin!' : `Welcome, ${user?.firstName}!`}
                </button>
                {userMenuOpen && (
                  <div className="navbar__user-dropdown">
                    {!isAdmin && (
                      <Link
                        to="/profile"
                        className="navbar__user-dropdown-item"
                        onClick={() => { setUserMenuOpen(false); setMenuOpen(false); }}
                      >
                        My Profile
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="navbar__user-dropdown-item"
                        onClick={() => { setUserMenuOpen(false); setMenuOpen(false); }}
                      >
                        Admin Dashboard
                      </Link>
                    )}
                    <button
                      className="navbar__user-dropdown-item"
                      onClick={handleLogout}
                    >
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className={location.pathname === '/login' || location.pathname === '/register' ? 'active' : ''}
                onClick={() => setMenuOpen(false)}
              >
                Log In
              </Link>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
}
