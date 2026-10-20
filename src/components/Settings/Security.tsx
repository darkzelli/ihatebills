// Encryption at rest: the lock screen, and the on/off/change-password controls in Settings.
import { type FormEvent, useState } from "react";
import { WrongPassword } from "../../lib/crypto";
import * as storage from "../../lib/storage";
import { flush, snapshotJson, useDb } from "../../store/db";

export const MIN_PASSWORD = 8;

/** Argon2id runs on the main thread for about a second; let "Unlocking…" paint first. */
const nextFrame = () => new Promise((r) => setTimeout(r, 30));
const message = (e: unknown) => (e instanceof WrongPassword ? "That password isn't right." : String(e instanceof Error ? e.message : e));

export function UnlockScreen() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setErr(null);
    await nextFrame();
    try {
      await storage.unlock(pw);
      await useDb.getState().load();
    } catch (e) {
      setErr(message(e));
      setBusy(false);
    }
  };
  return (
    <div className="unlock">
      <form className="unlock-card" onSubmit={submit}>
        <span className="brand">i<b>hate</b>bills</span>
        <span className="muted">Your bills are encrypted. Enter your password to open them.</span>
        <input className="input" type="password" autoFocus autoComplete="current-password" placeholder="Password"
          value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} aria-label="Password" />
        {err && <span className="sec-err">{err}</span>}
        <button className="btn primary" type="submit" disabled={!pw || busy}>{busy ? "Unlocking…" : "Unlock"}</button>
      </form>
    </div>
  );
}

type Mode = "enable" | "disable" | "change";

/** Settings section. `setBusy` keeps the dialog open while files are being rewritten. */
export function EncryptionSettings({ setBusy }: { setBusy(b: boolean): void }) {
  const status = storage.useVault((s) => s.status);
  const [mode, setMode] = useState<Mode | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const on = status === "on";

  if (mode) {
    return <PasswordForm mode={mode} setBusy={setBusy}
      onDone={(msg) => { setMode(null); setDone(msg); }} onCancel={() => setMode(null)} />;
  }
  return (
    <section className="sec">
      <div className="sec-head">
        <h4 className="label">Encryption</h4>
        <span className={`pill ${on ? "c-green" : "c-gray"}`}>{on ? "On" : "Off"}</span>
      </div>
      <span className="muted">
        {on
          ? "Your bills and scans are encrypted on this device with AES-256. They can only be opened with your password."
          : "Encrypt your bills and scans with a password, so nobody who gets hold of this computer's files can read them."}
      </span>
      {done && <span className="sec-ok">{done}</span>}
      <div className="tb-line">
        {on ? (
          <>
            <button className="btn" onClick={() => { flush(); storage.lock(); }}>Lock now</button>
            <button className="btn" onClick={() => setMode("change")}>Change password…</button>
            <span className="spacer" />
            <button className="btn danger" onClick={() => setMode("disable")}>Turn off…</button>
          </>
        ) : (
          <button className="btn primary" onClick={() => setMode("enable")}>Turn on encryption…</button>
        )}
      </div>
    </section>
  );
}

function PasswordForm({ mode, setBusy, onDone, onCancel }: {
  mode: Mode; setBusy(b: boolean): void; onDone(msg: string): void; onCancel(): void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsCurrent = mode !== "enable";
  const needsNew = mode !== "disable";
  const problem =
    needsCurrent && !current ? "Enter your current password."
    : needsNew && next.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.`
    : needsNew && next !== confirm ? "The passwords don't match."
    : mode === "enable" && !ack ? "Tick the box to confirm."
    : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem || working) return;
    setWorking(true);
    setBusy(true);
    setErr(null);
    await nextFrame();
    try {
      if (mode === "enable") await storage.enable(next, snapshotJson());
      if (mode === "disable") await storage.disable(current, snapshotJson());
      if (mode === "change") await storage.changePassword(current, next);
      onDone(mode === "enable" ? "Encryption is on." : mode === "disable" ? "Encryption is off. Your files are stored unencrypted." : "Password changed.");
    } catch (e) {
      setErr(message(e));
    } finally {
      setWorking(false);
      setBusy(false);
    }
  };

  const title = mode === "enable" ? "Turn on encryption" : mode === "disable" ? "Turn off encryption" : "Change password";
  return (
    <form className="sec" onSubmit={submit}>
      <h4 className="label">{title}</h4>
      {mode === "enable" && (
        <span className="muted">A long passphrase of four or more random words is both strong and easy to remember.</span>
      )}
      {mode === "disable" && (
        <span className="muted">Your bills and scans will be decrypted and stored as ordinary files that anyone with access to this computer can read.</span>
      )}
      {needsCurrent && (
        <input className="input" type="password" autoFocus autoComplete="current-password" placeholder="Current password"
          value={current} onChange={(e) => setCurrent(e.target.value)} disabled={working} aria-label="Current password" />
      )}
      {needsNew && (
        <>
          <input className="input" type="password" autoFocus={!needsCurrent} autoComplete="new-password" placeholder="New password"
            value={next} onChange={(e) => setNext(e.target.value)} disabled={working} aria-label="New password" />
          <input className="input" type="password" autoComplete="new-password" placeholder="Type it again"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={working} aria-label="Confirm new password" />
        </>
      )}
      {mode === "enable" && (
        <label className="sec-ack">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={working} />
          <span>I understand there is no way to recover my bills if I forget this password.</span>
        </label>
      )}
      {err && <span className="sec-err">{err}</span>}
      {working && <span className="muted">{mode === "change" ? "Changing password…" : mode === "enable" ? "Encrypting your bills and scans…" : "Decrypting your bills and scans…"}</span>}
      <div className="tb-line">
        <span className="tb-hint">{!working && (current || next || confirm) ? problem : null}</span>
        <span className="spacer" />
        <button className="btn" type="button" onClick={onCancel} disabled={working}>Cancel</button>
        <button className={`btn ${mode === "disable" ? "danger" : "primary"}`} type="submit" disabled={!!problem || working}>{title}</button>
      </div>
    </form>
  );
}
