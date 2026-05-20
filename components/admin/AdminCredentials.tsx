"use client";

import { useEffect, useState } from "react";
import {
  addAdminUser,
  deleteAdminUser,
  listAdminUsers,
  type AdminUserView,
} from "@/lib/actions";

export default function AdminCredentials() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await listAdminUsers();
      setUsers(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await addAdminUser(username, password);
      if (res.ok) {
        setNotice(`Added user "${username.trim()}".`);
        setUsername("");
        setPassword("");
        await refresh();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add user.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: number, name: string) => {
    if (!confirm(`Delete login "${name}"? They will no longer be able to sign in.`)) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await deleteAdminUser(id);
      if (res.ok) {
        setNotice(`Removed "${name}".`);
        await refresh();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h3 className="admin-card-title">Cafe PWA login credentials</h3>
        <p className="admin-card-sub">
          Add or remove the login IDs &amp; passwords used to sign in on the
          Cafe Tablet (PWA) before giving feedback. If no users exist, the
          fallback login from environment variables is still accepted.
        </p>
      </div>

      <form className="cred-form" onSubmit={onAdd}>
        <div className="cred-fields">
          <label className="cred-label">
            Login ID
            <input
              className="cred-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. centre-manager-ccg or person@smartworks.in"
              autoComplete="off"
              required
            />
          </label>
          <label className="cred-label">
            Password
            <input
              className="cred-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              required
            />
          </label>
        </div>
        <button className="cred-add" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add login"}
        </button>
      </form>

      {error && <p className="cred-error">{error}</p>}
      {notice && <p className="cred-notice">{notice}</p>}

      <div className="cred-list">
        <div className="cred-list-head">
          <span>Login ID</span>
          <span>Added</span>
          <span></span>
        </div>
        {loading ? (
          <div className="cred-empty">Loading…</div>
        ) : users.length === 0 ? (
          <div className="cred-empty">
            No DB users yet — fallback admin from env vars is in use.
          </div>
        ) : (
          users.map((u) => (
            <div className="cred-row" key={u.id}>
              <span className="cred-name">{u.username}</span>
              <span className="cred-date">
                {new Date(u.createdAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                className="cred-del"
                onClick={() => onDelete(u.id, u.username)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
