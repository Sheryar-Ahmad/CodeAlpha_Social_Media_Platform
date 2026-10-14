import { useEffect, useId, useRef } from 'react';
import { X, Check } from 'lucide-react';

export function Brand() {
  return (
    <span className="brand">
      forma<span aria-hidden="true">/</span>
    </span>
  );
}

export function Avatar({ person, size = 'normal' }) {
  const initials =
    person.initials ||
    person.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('');
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {person.photo ? <img src={person.photo} alt="" width="80" height="80" /> : initials}
    </span>
  );
}

export function Dialog({ title, children, onClose, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    return () => element.close();
  }, []);

  function closeOnBackdrop(event) {
    if (event.target !== event.currentTarget) return;
    const box = ref.current.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      onClose();
  }

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={closeOnBackdrop}
    >
      <header className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function FollowButton({ person, following, onFollow }) {
  return (
    <button
      className={`follow-button ${following ? 'is-following' : ''}`}
      onClick={() => onFollow(person.id)}
      aria-pressed={following}
      aria-label={`${following ? 'Unfollow' : 'Follow'} ${person.name}`}
    >
      {following ? (
        <>
          <Check size={14} /> Following
        </>
      ) : (
        'Follow'
      )}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, detail, action, onAction }) {
  return (
    <section className="empty-state">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action && (
        <button className="primary-button" onClick={onAction}>
          {action}
        </button>
      )}
    </section>
  );
}
