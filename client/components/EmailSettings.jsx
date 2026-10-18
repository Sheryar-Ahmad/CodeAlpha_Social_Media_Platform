import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { api } from '../lib/api.js';

export default function EmailSettings() {
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api('/auth/email')
      .then((result) => {
        if (active) setAccount(result);
      })
      .catch((issue) => {
        if (active) setError(issue.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function send() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api('/auth/verification-email', { method: 'POST' });
      setNotice(result.message);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-section" aria-labelledby="email-heading">
      <h3 id="email-heading">
        <MailCheck size={18} />
        Email address
      </h3>
      <p>
        {account
          ? `${account.email} · ${account.verified ? 'Verified' : 'Not verified yet'}`
          : 'Loading email status…'}
      </p>
      {!account?.verified && (
        <button className="secondary-button" onClick={send} disabled={busy}>
          {busy ? 'Requesting…' : 'Send verification email'}
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-notice" role="status">
        {notice}
      </p>
    </section>
  );
}
