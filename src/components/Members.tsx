import './Members.css';

const members = [
  {
    name: 'Alex Rivera',
    specialty: 'Landscape Photography',
    avatar: 'https://picsum.photos/id/1005/300/300',
  },
  {
    name: 'Jordan Lee',
    specialty: 'Street Photography',
    avatar: 'https://picsum.photos/id/1011/300/300',
  },
  {
    name: 'Sam Patel',
    specialty: 'Portrait Photography',
    avatar: 'https://picsum.photos/id/1012/300/300',
  },
  {
    name: 'Casey Kim',
    specialty: 'Macro Photography',
    avatar: 'https://picsum.photos/id/1027/300/300',
  },
];

export default function Members() {
  return (
    <section id="members" className="members section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Our Members</h2>
          <p>Meet some of the talented photographers in our community</p>
        </div>
        <div className="members__grid fade-in-up">
          {members.map((member) => (
            <div className="members__card" key={member.name}>
              <div className="members__avatar">
                <img src={member.avatar} alt={member.name} loading="lazy" />
              </div>
              <h3>{member.name}</h3>
              <p>{member.specialty}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
