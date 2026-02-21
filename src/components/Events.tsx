import './Events.css';

const events = [
  {
    month: 'MAR',
    day: '15',
    title: 'Spring Photo Walk',
    description:
      'Join us for a sunrise photo walk through the botanical gardens. All skill levels welcome — bring any camera you have.',
  },
  {
    month: 'APR',
    day: '05',
    title: 'Portrait Workshop',
    description:
      'Learn the fundamentals of portrait photography including lighting, posing, and post-processing techniques.',
  },
  {
    month: 'MAY',
    day: '20',
    title: 'Annual Exhibition',
    description:
      'Our yearly showcase at the Downtown Gallery. Submit your best work and celebrate our community\'s talent.',
  },
];

export default function Events() {
  return (
    <section id="events" className="events section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Upcoming Events</h2>
          <p>Join us at our next gathering and connect with fellow photographers</p>
        </div>
        <div className="events__grid fade-in-up">
          {events.map((event) => (
            <div className="events__card" key={event.title}>
              <div className="events__date">
                <span className="events__month">{event.month}</span>
                <span className="events__day">{event.day}</span>
              </div>
              <div className="events__info">
                <h3>{event.title}</h3>
                <p>{event.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
