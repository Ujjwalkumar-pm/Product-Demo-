"use client";

import { useState } from "react";
import { loginPwa } from "@/lib/auth";

export default function CafeLogin({
  centreShort,
  onLogin,
}: {
  centreShort: string;
  onLogin: (username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await loginPwa(username, password);
      if (res.ok) {
        onLogin(res.username);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen active cafe-login">
      <div className="brand-strip">
        <div className="brand-mark">
          Smartworks · <span>cafe</span>
        </div>
        <div className="centre-pill">{centreShort}</div>
      </div>
      <h1 className="welcome-display">
        Sign <em>in</em>
      </h1>
      <p className="welcome-sub">
        Please sign in with your Smartworks login to share feedback.
      </p>
      <form className="cafe-login-form" onSubmit={onSubmit}>
        <label className="cafe-login-label">
          Login ID
          <input
            className="cafe-login-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </label>
        <label className="cafe-login-label">
          Password
          <input
            className="cafe-login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="cafe-login-error">{error}</p>}
        <button className="big-cta" type="submit" disabled={busy}>
          <span>{busy ? "Signing in…" : "Sign in"}</span>
          <span className="arrow">→</span>
        </button>
      </form>
      <div className="timer-tag">
        Your login stays active for this session · 8h
      </div>
    </div>
  );
}
