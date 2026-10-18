import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';

export default function Moderation() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api('/safety/moderation/reports');
      setReports(result.reports);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function review(event, id) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/safety/moderation/reports/${id}`, { method: 'POST', body: values });
      setReports((previous) => previous.filter((report) => report.id !== id));
      setNotice('Report reviewed.');
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="moderation-screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">COMMUNITY CARE</p>
          <h1>
            <ShieldCheck size={24} />
            Moderation queue
          </h1>
        </div>
        <button className="text-button" onClick={load} disabled={loading || busy}>
          <RefreshCw size={16} />
          Refresh reports
        </button>
      </div>
      <p className="muted">
        Review reports in order. Remove content that violates the community rules, or suspend a
        member when necessary. Up to 50 pending reports are shown; refresh for the next batch.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-notice" role="status">
        {loading ? 'Loading reports…' : notice}
      </p>
      {!loading && !error && reports.length === 0 && <p className="muted">No pending reports.</p>}
      {reports.map((report) => (
        <article className="moderation-report" key={report.id}>
          <p className="eyebrow">
            {report.kind.toUpperCase()} REPORT · {report.reason.toUpperCase()}
          </p>
          <h2>{report.member?.name || 'Unavailable member'}</h2>
          <p className="muted">
            Reported by {report.reporter?.name || 'Former member'} on{' '}
            {new Date(report.createdAt).toLocaleDateString()}
          </p>
          {report.post && (
            <blockquote>
              <strong>{report.post.title}</strong>
              <p>{report.post.text}</p>
              {report.post.image && <img src={report.post.image} alt="Reported attachment" />}
            </blockquote>
          )}
          <p>{report.details || 'No additional details.'}</p>
          <form className="account-form" onSubmit={(event) => review(event, report.id)}>
            <label htmlFor={`resolution-${report.id}`}>Decision</label>
            <select id={`resolution-${report.id}`} name="action" defaultValue="dismiss">
              <option value="dismiss">Dismiss report</option>
              {report.kind === 'post' && <option value="remove-post">Remove post</option>}
              <option value="suspend-member">Suspend member</option>
            </select>
            <label htmlFor={`notes-${report.id}`}>Review notes</label>
            <textarea id={`notes-${report.id}`} name="notes" maxLength={500} rows={2} />
            <p className="input-hint">
              Removing a post deletes its content and photo. Suspension ends sign-in access and
              hides the member’s content.
            </p>
            <button className="secondary-button" disabled={busy}>
              Apply decision
            </button>
          </form>
        </article>
      ))}
    </section>
  );
}
