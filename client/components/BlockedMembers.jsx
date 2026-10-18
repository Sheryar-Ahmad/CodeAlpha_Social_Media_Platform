import { useEffect, useState } from 'react';
import { ShieldBan } from 'lucide-react';
import { api } from '../lib/api.js';

export default function BlockedMembers({ onChanged }) {
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/safety/blocked')
      .then((result) => {
        if (active) setPeople(result.people);
      })
      .catch((issue) => {
        if (active) setError(issue.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function unblock(id) {
    setBusy(true);
    setError('');
    try {
      await api(`/safety/blocks/${id}`, { method: 'DELETE' });
      setPeople((previous) => previous.filter((person) => person.id !== id));
      await onChanged();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-section" aria-labelledby="blocked-heading">
      <h3 id="blocked-heading">
        <ShieldBan size={18} />
        Blocked members
      </h3>
      <p>
        Blocking hides profiles, posts, and replies in both directions. Unblocking does not restore
        follows.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {people.length === 0 && <p>No blocked members.</p>}
      <ul className="session-list">
        {people.map((person) => (
          <li key={person.id}>
            <strong>{person.name}</strong>
            <button className="text-button" disabled={busy} onClick={() => unblock(person.id)}>
              Unblock {person.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
