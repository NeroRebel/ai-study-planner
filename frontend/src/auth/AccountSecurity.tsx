import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { authMessage } from "./authStore";
import { Button } from "../components/common/Controls";
import { FormField } from "../components/common/FormField";
import { Feedback } from "../components/common/Feedback";

export function AccountSecurity() {
  const auth = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(authMessage(error)); } finally { setBusy(false); }
  }
  return <>
    <div className="preference-row"><div><strong>Password recovery</strong><p className="muted">Send a recovery link to your email.</p></div>
      <Link className="button button-secondary" to="/forgot-password">Reset password</Link></div>
    <div className="preference-row"><div><strong>Sign out of this device</strong><p className="muted">Your saved study data stays in your account.</p></div>
      <Button disabled={busy} onClick={() => { void run(async () => { await auth.actions?.signOut(); }); }}>Sign out</Button></div>
    <details className="account-danger"><summary>Delete account</summary>
      <p>This permanently deletes your account, subjects, tasks, sessions, availability and avatar. This cannot be undone.</p>
      <FormField label="Type DELETE to confirm"><input value={confirmation} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /></FormField>
      <Button variant="destructive" loading={busy} disabled={confirmation !== "DELETE"} onClick={() => { void run(async () => { await auth.actions?.deleteAccount(confirmation); }); }}>Permanently delete account</Button>
    </details>
    {busy && <p role="status" className="form-note">Updating your account…</p>}
    {error && <Feedback tone="error">{error}</Feedback>}
  </>;
}
