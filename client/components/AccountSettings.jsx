import { useEffect, useState } from 'react';
import { Download, ShieldCheck, Monitor, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';

function date(value) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function PasswordForm({ busy, onChange }) {
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const { currentPassword, newPassword, confirmation } = Object.fromEntries(new FormData(form));
    if (newPassword !== confirmation) {
      setError('Your new passwords do not match.');
      return;
    }
    setError('');
    if (await onChange({ currentPassword, newPassword })) form.reset();
  }
  return (
    <section className="account-section" aria-labelledby="password-heading">
      <h3 id="password-heading">
        <KeyRound size={18} />
        Change password
      </h3>
      <p>
        Choose a different password with at least 12 characters. This signs out your other sessions.
      </p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="secondary-button" disabled={busy}>
          Update password
        </button>
      </form>
    </section>
  );
}

export default function AccountSettings({ onSessionRenewed, onSessionExpired }) {
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api('/account/sessions')
      .then((result) => {
        if (active) setSessions(result.sessions);
      })
      .catch((issue) => {
        if (active) {
          setError(issue.message);
          if (issue.status === 401) void onSessionExpired();
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function reloadSessions() {
    const result = await api('/account/sessions');
    setSessions(result.sessions);
  }
  async function run(operation, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(message);
      return true;
    } catch (issue) {
      setError(issue.message);
      if (issue.status === 401) await onSessionExpired();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(values) {
    return run(async () => {
      await api('/account/password', { method: 'POST', body: values });
      try {
        await onSessionRenewed();
        await reloadSessions();
      } catch {
        // The password has already changed; a failed refresh must not invite a duplicate write.
        setSessions(null);
        setError('Your password was updated. Reload your sessions when the connection returns.');
      }
    }, 'Password updated. Your other sessions have been signed out.');
  }
  async function endSession(id) {
    await run(
      async () => {
        await api(`/account/sessions/${id}`, { method: 'DELETE' });
        await reloadSessions();
      },
      id === 'others' ? 'Other sessions signed out.' : 'Session ended.',
    );
  }
  async function download() {
    await run(async () => {
      const data = await api('/account/export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'forma-data.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Your data download is ready.');
  }

  return (
    <div className="account-settings" aria-busy={busy}>
      <div className="account-intro">
        <ShieldCheck size={22} />
        <p>
          Your account, your control.
          <br />
          <span>Manage access and keep a copy of your contributions.</span>
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-notice" role="status">
        {busy ? 'Saving your request…' : notice}
      </p>
      <PasswordForm busy={busy} onChange={changePassword} />
      <section className="account-section" aria-labelledby="sessions-heading">
        <div className="account-section-heading">
          <h3 id="sessions-heading">
            <Monitor size={18} />
            Signed-in sessions
          </h3>
          <button
            className="text-button"
            onClick={() => endSession('others')}
            disabled={busy || !sessions?.some((session) => !session.current)}
          >
            Sign out other sessions
          </button>
        </div>
        <p>Browser labels are approximate. Sessions expire seven days after sign-in.</p>
        {!sessions ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => run(reloadSessions, 'Sessions refreshed.')}
          >
            {error ? 'Retry loading sessions' : 'Loading sessions…'}
          </button>
        ) : (
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <div>
                  <strong>{session.device}</strong>
                  {session.current && <span className="current-session">This session</span>}
                  <p>
                    Signed in <time dateTime={session.createdAt}>{date(session.createdAt)}</time>
                  </p>
                </div>
                {!session.current && (
                  <button
                    className="text-button"
                    onClick={() => endSession(session.id)}
                    disabled={busy}
                  >
                    End session
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="account-section" aria-labelledby="export-heading">
        <h3 id="export-heading">
          <Download size={18} />
          Your data
        </h3>
        <p>
          Download your profile, posts, replies, likes, follows, collections, preferences, and
          activity as JSON. Photos are included as links.
        </p>
        <button className="secondary-button" onClick={download} disabled={busy}>
          Download my data <Download size={16} />
        </button>
      </section>
    </div>
  );
}
