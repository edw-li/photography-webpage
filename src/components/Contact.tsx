import { useState, useRef, type FormEvent } from 'react';
import { submitContact } from '../api/contact';
import { useTurnstile } from '../hooks/useTurnstile';
import './Contact.css';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const { getToken, resetWidget } = useTurnstile(turnstileRef);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitContact({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        website,
        turnstileToken: getToken(),
      });
      setSuccess(true);
      setName('');
      setEmail('');
      setMessage('');
      resetWidget();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="contact section">
      <div className="container">
        <div className="section-title section-title--light fade-in-up">
          <h2>Get In Touch</h2>
          <p>Interested in joining? Drop us a message and we'll get back to you</p>
        </div>
        <div className="contact__grid fade-in-up">
          {success ? (
            <div className="contact__success">
              <h3>Message Sent!</h3>
              <p>Thank you for reaching out. We'll get back to you soon.</p>
              <button
                className="btn btn-primary"
                onClick={() => setSuccess(false)}
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form className="contact__form" onSubmit={handleSubmit}>
              <div className="contact__field">
                <label htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="contact__field">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="contact__field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  rows={5}
                  placeholder="Tell us about yourself..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              {/* Honeypot */}
              <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
                <label htmlFor="contact-website">Website</label>
                <input
                  type="text"
                  id="contact-website"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              <div ref={turnstileRef} />
              {error && <p className="contact__error">{error}</p>}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
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
