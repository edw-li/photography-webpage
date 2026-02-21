import './Gallery.css';

const photos = [
  { id: 1015, title: 'Misty River', photographer: 'Alex Rivera' },
  { id: 1016, title: 'Golden Hour', photographer: 'Jordan Lee' },
  { id: 1019, title: 'Mountain Dawn', photographer: 'Sam Patel' },
  { id: 1022, title: 'Urban Geometry', photographer: 'Casey Kim' },
  { id: 1029, title: 'Autumn Path', photographer: 'Morgan Chen' },
  { id: 1035, title: 'Desert Light', photographer: 'Taylor Brooks' },
  { id: 1039, title: 'Ocean Calm', photographer: 'Riley Quinn' },
  { id: 1042, title: 'City Nights', photographer: 'Jamie Santos' },
  { id: 1043, title: 'Forest Canopy', photographer: 'Drew Nakamura' },
  { id: 1044, title: 'Meadow Bloom', photographer: 'Avery Walsh' },
  { id: 1047, title: 'Coastal Rocks', photographer: 'Skyler Dunn' },
  { id: 1050, title: 'Still Waters', photographer: 'Reese Harper' },
];

export default function Gallery() {
  return (
    <section id="gallery" className="gallery section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Gallery</h2>
          <p>A showcase of our members' best work</p>
        </div>
        <div className="gallery__grid fade-in-up">
          {photos.map((photo) => (
            <div className="gallery__item" key={photo.id}>
              <img
                src={`https://picsum.photos/id/${photo.id}/600/400`}
                alt={photo.title}
                loading="lazy"
              />
              <div className="gallery__overlay">
                <h3>{photo.title}</h3>
                <p>{photo.photographer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
