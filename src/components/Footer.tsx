import { useLocation, useNavigate } from 'react-router-dom';
import { scrollToSection } from '../utils/scrollToSection';
import footerIcon from '../assets/icon-selah-white.png';
import './Footer.css';

export default function Footer() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    if (isHomePage) {
      scrollToSection(sectionId);
    } else {
      navigate('/', { state: { scrollTo: sectionId } });
    }
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <h3>
              <img src={footerIcon} alt="" className="footer__brand-icon" width="36" height="36" />
              Selah <span>Photography</span>
            </h3>
            <p>
              A community of passionate photographers dedicated to the art of
              capturing God's creation — one frame at a time. <br />
              Join us and capture the world together.
            </p>
          </div>
          <div className="footer__links">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#about" onClick={(e) => handleLinkClick(e, 'about')}>About</a></li>
              <li><a href="#gallery" onClick={(e) => handleLinkClick(e, 'gallery')}>Gallery</a></li>
              <li><a href="#events" onClick={(e) => handleLinkClick(e, 'events')}>Events</a></li>
              <li><a href="#members" onClick={(e) => handleLinkClick(e, 'members')}>Members</a></li>
              <li><a href="#contact" onClick={(e) => handleLinkClick(e, 'contact')}>Contact</a></li>
            </ul>
          </div>
          <div className="footer__social">
            <h4>Connect</h4>
            <ul>
              <li><a href="https://instagram.com/selahphotographyclub" target="_blank" rel="noopener noreferrer">Instagram</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bar">
          <p>&copy; 2026 Selah Photography Club. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
