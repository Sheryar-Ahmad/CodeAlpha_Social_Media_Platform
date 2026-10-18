import { useState } from 'react';
import { api } from '../lib/api.js';

export default function ReportForm({ target, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/safety/reports', {
        method: 'POST',
        body: { kind: target.kind, targetId: target.id, ...values },
      });
      onDone();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="edit-form" onSubmit={submit}>
      <p className="muted">
        Reports are private and reviewed by moderators. For immediate personal control, you can also
        block a member from their profile.
      </p>
      <label htmlFor="report-reason">Reason</label>
      <select id="report-reason" name="reason" required defaultValue="spam">
        <option value="spam">Spam or misleading content</option>
        <option value="harassment">Harassment or bullying</option>
        <option value="hate">Hateful content</option>
        <option value="sexual">Sexual content</option>
        <option value="dangerous">Dangerous content</option>
        <option value="other">Something else</option>
      </select>
      <label htmlFor="report-details">Additional details (optional)</label>
      <textarea id="report-details" name="details" rows={4} maxLength={500} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit report'}
      </button>
    </form>
  );
}
