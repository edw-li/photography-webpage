import { type FormEvent } from 'react';
import './Contact.css';

export default function Contact() {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <section id="contact" className="contact section">
      <div className="container">
        <div className="section-title section-title--light fade-in-up">
          <h2>Get In Touch</h2>
          <p>Interested in joining? Drop us a message and we'll get back to you</p>
        </div>
        <div className="contact__grid fade-in-up">
          <form className="contact__form" onSubmit={handleSubmit}>
            <div className="contact__field">
              <label htmlFor="name">Name</label>
              <input type="text" id="name" placeholder="Your name" />
            </div>
            <div className="contact__field">
              <label htmlFor="email">Email</label>
              <input type="email" id="email" placeholder="you@example.com" />
            </div>
            <div className="contact__field">
              <label htmlFor="message">Message</label>
              <textarea id="message" rows={5} placeholder="Tell us about yourself..." />
            </div>
            <button type="submit" className="btn btn-primary">
              Send Message
            </button>
          </form>
          <div className="contact__info">
            <div className="contact__info-item">
              <h3>Location</h3>
              <p>123 Camera Lane<br />Photography District, PH 90210</p>
            </div>
            <div className="contact__info-item">
              <h3>Email</h3>
              <p>hello@aperturecollective.com</p>
            </div>
            <div className="contact__info-item">
              <h3>Meetings</h3>
              <p>Every Saturday, 10:00 AM<br />Community Arts Center, Room 204</p>
            </div>
            <div className="contact__info-item">
              <h3>Follow Us</h3>
              <div className="contact__socials">
                <a href="#" aria-label="Instagram">Instagram</a>
                <a href="#" aria-label="Facebook">Facebook</a>
                <a href="#" aria-label="Twitter">Twitter</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
