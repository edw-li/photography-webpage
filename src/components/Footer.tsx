import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <h3>
              Bridgeway <span>Photography</span>
            </h3>
            <p>
              A community of passionate photographers dedicated to the art of
              visual storytelling. Join us and capture the world together.
            </p>
          </div>
          <div className="footer__links">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#about">About</a></li>
              <li><a href="#gallery">Gallery</a></li>
              <li><a href="#events">Events</a></li>
              <li><a href="#members">Members</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
          <div className="footer__social">
            <h4>Connect</h4>
            <ul>
              <li><a href="#">Instagram</a></li>
              <li><a href="#">Facebook</a></li>
              <li><a href="#">Twitter</a></li>
              <li><a href="#">YouTube</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bar">
          <p>&copy; 2026 Bridgeway Photography. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
