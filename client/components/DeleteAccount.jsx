import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';

export default function DeleteAccount({ onClosed }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/account', { method: 'DELETE', body: values });
      await onClosed();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-section" aria-labelledby="delete-heading">
      <h3 id="delete-heading">
        <Trash2 size={18} />
        Close your account
      </h3>
      <p>
        Closing hides your account immediately and queues removal of your profile data, posts,
        replies, reactions, and photos. Download your data first. This cannot be undone.
      </p>
      {!confirming ? (
        <button className="text-button danger-text" onClick={() => setConfirming(true)}>
          Delete my account
        </button>
      ) : (
        <form className="account-form" onSubmit={submit}>
          <label htmlFor="delete-password">Current password to delete account</label>
          <input
            id="delete-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
          <label htmlFor="delete-confirm">Type DELETE to confirm</label>
          <input
            id="delete-confirm"
            name="confirmation"
            pattern="DELETE"
            autoComplete="off"
            required
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? 'Closing account…' : 'Permanently close account'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              setError('');
            }}
          >
            Keep my account
          </button>
        </form>
      )}
    </section>
  );
}
