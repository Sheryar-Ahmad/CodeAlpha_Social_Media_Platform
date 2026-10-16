import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';

export default function ManageCollections({ collections, dispatch, busy, onDeleted }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  async function rename(event) {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Give your collection a name.');
      return;
    }
    if (
      collections.some(
        (item) => item.id !== editing && item.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      setError('You already have a collection with this name.');
      return;
    }
    if (await dispatch({ type: 'collection.rename', id: editing, name: name.trim() }))
      setEditing(null);
  }
  async function remove(id) {
    if (await dispatch({ type: 'collection.delete', id })) {
      setDeleting(null);
      onDeleted(id);
    }
  }
  return (
    <div className="manage-collections">
      <p>
        Rename your collections or remove the ones you no longer need. Removing a collection keeps
        its posts in All saved.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {collections.length === 0 && (
        <p className="muted">No collections yet. Create one from Saved.</p>
      )}
      <ul>
        {collections.map((item) => (
          <li key={item.id}>
            {editing === item.id ? (
              <form className="collection-rename" onSubmit={rename}>
                <label className="sr-only" htmlFor={`rename-${item.id}`}>
                  Collection name
                </label>
                <input
                  id={`rename-${item.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={30}
                  required
                  autoFocus
                />
                <button className="icon-button" aria-label="Save collection name" disabled={busy}>
                  <Check size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Cancel rename"
                  onClick={() => setEditing(null)}
                  disabled={busy}
                >
                  <X size={18} />
                </button>
              </form>
            ) : (
              <div className="collection-row">
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.postIds.length} saved posts</small>
                </div>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Rename ${item.name}`}
                    disabled={busy}
                    onClick={() => {
                      setEditing(item.id);
                      setName(item.name);
                      setDeleting(null);
                      setError('');
                    }}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${item.name}`}
                    disabled={busy}
                    onClick={() => {
                      setDeleting(item.id);
                      setEditing(null);
                      setError('');
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            )}
            {deleting === item.id && (
              <div className="collection-confirm">
                <p>Remove “{item.name}”? Its posts will stay saved.</p>
                <button className="text-button" disabled={busy} onClick={() => setDeleting(null)}>
                  Keep collection
                </button>
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() => remove(item.id)}
                >
                  Remove collection
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
