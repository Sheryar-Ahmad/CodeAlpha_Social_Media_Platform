import { useState } from 'react';
import { CheckCircle2, KeyRound, MailCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { Brand } from './ui.jsx';

export default function IdentityAction({ action, token, onBack }) {
  const verification = action === 'verify-email';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function submit(event) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!verification && values.newPassword !== values.confirmation) {
      setError('Your new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/auth/${action}`, {
        method: 'POST',
        body: {
          token,
          ...(!verification ? { newPassword: values.newPassword } : {}),
        },
      });
      history.replaceState(null, '', location.pathname);
      setDone(result.message);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="identity-page">
      <Brand />
      <section className="identity-card">
        <div className="identity-icon">
          {done ? (
            <CheckCircle2 size={30} />
          ) : verification ? (
            <MailCheck size={30} />
          ) : (
            <KeyRound size={30} />
          )}
        </div>
        <h1>
          {done
            ? verification
              ? 'You’re verified.'
              : 'A fresh start.'
            : verification
              ? 'Confirm your email.'
              : 'Set a new password.'}
        </h1>
        {done ? (
          <p role="status">{done}</p>
        ) : (
          <>
            <p>
              {verification
                ? 'Confirm ownership of your email address to join the conversation.'
                : 'Choose a strong password with at least 12 characters.'}
            </p>
            <form className="account-form" onSubmit={submit}>
              {!verification && (
                <>
                  <label htmlFor="reset-password">New password</label>
                  <input
                    id="reset-password"
                    name="newPassword"
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                  <label htmlFor="reset-confirm">Confirm new password</label>
                  <input
                    id="reset-confirm"
                    name="confirmation"
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary-button" disabled={busy}>
                {busy ? 'Please wait…' : verification ? 'Verify my email' : 'Set new password'}
              </button>
            </form>
          </>
        )}
        <button className="text-button" disabled={busy} onClick={onBack}>
          {done ? 'Continue to Forma' : 'Back to sign in'}
        </button>
      </section>
    </main>
  );
}
