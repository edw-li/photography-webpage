import './About.css';

export default function About() {
  return (
    <section id="about" className="about section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>About Us</h2>
          <p>Learn more about our passionate community of photographers</p>
        </div>
        <div className="about__grid fade-in-up">
          <div className="about__text">
            <h3>Our Mission</h3>
            <p>
              At Bridgeway Photography, we believe photography is more than just
              capturing images — it's about telling stories, preserving memories,
              and seeing the world through a creative lens. Founded in 2018, our
              club brings together photographers of all skill levels to learn,
              share, and grow together.
            </p>
            <h3>Our Story</h3>
            <p>
              What started as a small group of five friends meeting at a local
              coffee shop has grown into a thriving community of over 50 active
              members. From weekend photo walks to gallery exhibitions, we've
              built a space where creativity flourishes and lasting friendships
              are formed.
            </p>
            <p>
              Whether you're picking up a camera for the first time or you've
              been shooting for decades, there's a place for you here.
            </p>
          </div>
          <div className="about__image">
            <img
              src="https://picsum.photos/id/1025/600/700"
              alt="Photography club members on a photo walk"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
