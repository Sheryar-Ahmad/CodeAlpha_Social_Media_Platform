import { BookOpen, BriefcaseBusiness, Camera, Code2, Layers3, Sun } from 'lucide-react';

const topicIcons = {
  Design: Layers3,
  Photography: Camera,
  Technology: Code2,
  Everyday: Sun,
  Learning: BookOpen,
  Career: BriefcaseBusiness,
};

export function TopicIcon({ topic, size = 14 }) {
  const Icon = topicIcons[topic] || Layers3;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

export function FlowerMark({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 180 180" fill="currentColor" aria-hidden="true">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <ellipse key={angle} cx="90" cy="47" rx="20" ry="42" transform={`rotate(${angle} 90 90)`} />
      ))}
      <circle cx="90" cy="90" r="18" fill="var(--flower-center, #f8f6ee)" />
    </svg>
  );
}

// This small collage uses real HTML and SVG so it stays sharp at every screen size.
export function PerspectiveArt({ className = '' }) {
  return (
    <div className={`perspective-art ${className}`} aria-hidden="true">
      <div className="art-orbit" />
      <div className="art-card art-photo">
        <img src="/images/mountains.jpg" alt="" width="320" height="400" />
        <span>A NEW PERSPECTIVE</span>
      </div>
      <div className="art-card art-idea">
        <span>GOOD THINGS START WITH</span>
        <strong>an idea.</strong>
        <FlowerMark />
        <small>MAKE ROOM FOR YOURS. ↗</small>
      </div>
      <div className="art-stamp">
        <span>
          Stay
          <br />
          curious.
        </span>
      </div>
      <span className="art-cross">+</span>
      <span className="art-dot" />
    </div>
  );
}

export function NotePattern({ topic }) {
  if (topic === 'Design' || topic === 'Everyday') return <FlowerMark className="note-pattern" />;
  return (
    <svg
      className="note-pattern"
      viewBox="0 0 180 180"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {topic === 'Technology' ? (
        <>
          {[30, 60, 90, 120, 150].map((position) => (
            <g key={position}>
              <path d={`M${position} 15v150M15 ${position}h150`} />
            </g>
          ))}
          <path
            d="M30 120 60 90 90 110 150 40"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : topic === 'Learning' ? (
        <>
          {[35, 65, 95].map((radius) => (
            <circle key={radius} cx="90" cy="90" r={radius} />
          ))}
          <path d="M10 90h160M90 10v160" />
        </>
      ) : (
        <>
          <path d="M20 160V80a70 70 0 0 1 140 0v80M45 160V80a45 45 0 0 1 90 0v80M70 160V80a20 20 0 0 1 40 0v80" />
          <circle cx="90" cy="80" r="7" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
