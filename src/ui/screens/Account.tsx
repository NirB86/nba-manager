import { useEffect, useState, type FormEvent } from 'react';
import { cloudConfigured, currentUser, signIn, signOut, signUp } from '../../cloud/cloud';
import { syncLeague } from '../../cloud/sync';
import { href, navigate } from '../router';

export function Account() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'ok' } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void currentUser().then((u) => setUserEmail(u?.email ?? null));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signup') {
        const mustConfirm = await signUp(email.trim(), password);
        if (mustConfirm) {
          setMessage({ tone: 'ok', text: 'Account created. Open the confirmation link we emailed you, then come back here and sign in.' });
          setMode('signin');
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      setMessage({ tone: 'ok', text: 'Signed in. Downloading the NBA league…' });
      const result = await syncLeague();
      if (result.status === 'error') setMessage({ tone: 'error', text: `Signed in, but the league could not be downloaded: ${result.message}` });
      else navigate();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  if (!cloudConfigured()) {
    return (
      <div className="wizard">
        <a className="back-link" href={href()}>
          ← Main menu
        </a>
        <h1>Account</h1>
        <p className="muted">Online features are not set up in this version of the game yet.</p>
      </div>
    );
  }

  return (
    <div className="wizard">
      <header className="wizard-head">
        <a className="back-link" href={href()}>
          ← Main menu
        </a>
        <h1>{userEmail ? 'Account' : mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      </header>
      <div className="wizard-body narrow">
        {userEmail ? (
          <div className="card">
            <p>
              Signed in as <strong>{userEmail}</strong>. The NBA league updates automatically when you open the game.
            </p>
            <div className="row-actions">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void signOut().then(() => setUserEmail(null));
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <form className="card" onSubmit={(e) => void submit(e)}>
            <p className="muted" style={{ marginBottom: 16 }}>
              Sign in to download the current NBA league with rosters, contracts and player photos. Your careers stay on this device.
            </p>
            <label className="field" htmlFor="email">
              <span>Email</span>
              <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field" htmlFor="password">
              <span>Password</span>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button className="btn btn-ghost" type="button" style={{ marginTop: 12 }} onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
          </form>
        )}
        {message && <p className={message.tone === 'error' ? 'error' : 'tone-good'}>{message.text}</p>}
      </div>
    </div>
  );
}
