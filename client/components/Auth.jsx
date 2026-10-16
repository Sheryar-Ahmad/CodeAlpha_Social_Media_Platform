import { useState } from 'react';
import { ArrowUpRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { Brand } from './ui.jsx';
import { FlowerMark, PerspectiveArt } from './Graphics.jsx';

export default function Auth({ authenticate, error, unavailable = false, retry }) {
  const [kind, setKind] = useState('login');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setLocalError('');
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await authenticate(kind, values);
    } catch {
      setLocalError('Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <header className="auth-brand-row">
        <a href="/" aria-label="Forma home">
          <Brand />
        </a>
        <FlowerMark className="auth-mobile-mark" />
      </header>
      <div className="auth-layout">
        <section className="auth-intro">
          <p className="eyebrow">IDEAS. WORK. EVERYDAY LIFE.</p>
          <h1>
            Your next idea
            <br />
            {' starts '}
            <span>here.</span>
          </h1>
          <p>
            Share a perspective. Learn something new.
            <br />
            Find the people who move you forward.
          </p>
          <PerspectiveArt className="auth-artwork" />
        </section>
        <section className="auth-card" aria-label="Account access">
          {unavailable ? (
            <>
              <h2>Let’s reconnect.</h2>
              <p>We couldn’t reach Forma. Please try again.</p>
              <p className="form-error" role="alert">
                {error}
              </p>
              <button className="primary-button" onClick={retry}>
                <RefreshCw size={17} />
                Try again
              </button>
              <a className="text-button" href="/demo">
                Explore the preview <ArrowUpRight size={17} />
              </a>
            </>
          ) : (
            <>
              <div className="auth-tabs">
                <button
                  aria-pressed={kind === 'login'}
                  onClick={() => {
                    setKind('login');
                    setLocalError('');
                  }}
                >
                  Sign in
                </button>
                <button
                  aria-pressed={kind === 'register'}
                  onClick={() => {
                    setKind('register');
                    setLocalError('');
                  }}
                >
                  Create account
                </button>
              </div>
              <h2>{kind === 'login' ? 'Welcome back.' : 'Make yourself at home.'}</h2>
              <p>
                {kind === 'login'
                  ? 'Your people and perspectives are waiting.'
                  : 'A space for your ideas, and your next chapter.'}
              </p>
              <form onSubmit={submit}>
                {kind === 'register' && (
                  <>
                    <label htmlFor="auth-name">Display name</label>
                    <input id="auth-name" name="name" autoComplete="name" maxLength={60} required />
                    <label htmlFor="auth-handle">Handle</label>
                    <input
                      id="auth-handle"
                      name="handle"
                      autoComplete="nickname"
                      minLength={3}
                      maxLength={25}
                      pattern="[a-zA-Z][a-zA-Z0-9_]{2,24}"
                      required
                    />
                    <p className="input-hint">
                      3–25 letters, numbers, or underscores. Start with a letter.
                    </p>
                  </>
                )}
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  maxLength={254}
                  required
                />
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={kind === 'login' ? 'current-password' : 'new-password'}
                  minLength={kind === 'register' ? 12 : 1}
                  maxLength={128}
                  required
                />
                {kind === 'register' && (
                  <p className="input-hint">
                    Use at least 12 characters. A longer phrase works well.
                  </p>
                )}
                {(error || localError) && (
                  <p className="form-error" role="alert">
                    {localError || error}
                  </p>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy ? (
                    <>
                      <LoaderCircle size={17} />
                      Please wait…
                    </>
                  ) : (
                    <>
                      {kind === 'login' ? 'Sign in to Forma' : 'Create my account'}
                      <ArrowUpRight size={17} />
                    </>
                  )}
                </button>
              </form>
              <div className="auth-preview">
                <span>Want a look around first?</span>
                <a className="text-button" href="/demo">
                  Explore the preview <ArrowUpRight size={15} />
                </a>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
