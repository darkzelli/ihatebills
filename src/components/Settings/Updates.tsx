// Settings section: which repo to update from, and checking for / installing new versions.
import { type FormEvent, useState } from "react";
import { updateEndpoint } from "../../lib/updates";
import { useUpdates } from "../../store/updates";

const mb = (n: number) => (n / 1048576).toFixed(1);

export function UpdateSettings({ setBusy }: { setBusy(b: boolean): void }) {
  const { repo, auto, version, status, setRepo, setAuto, check, install } = useUpdates();
  const [draft, setDraft] = useState(repo);
  const dirty = draft.trim() !== repo;
  const valid = !draft.trim() || !!updateEndpoint(draft);
  const working = status.kind === "checking" || status.kind === "installing";

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setRepo(draft);
    if (draft.trim()) void check();
  };
  const runInstall = async () => {
    setBusy(true);
    await install();
    setBusy(false);
  };

  return (
    <section className="sec">
      <div className="sec-head">
        <h4 className="label">Updates</h4>
        {version && <span className="pill c-gray">v{version}</span>}
      </div>
      <span className="muted">
        Paste the link to the app's GitHub repo. New versions published as releases there are downloaded and installed for you.
      </span>
      <form className="tb-line" onSubmit={save}>
        <input className="input upd-repo" placeholder="github.com/you/ihatebills" spellCheck={false} autoCapitalize="off"
          value={draft} onChange={(e) => setDraft(e.target.value)} disabled={working} aria-label="Update repository" />
        <button className="btn" type="submit" disabled={!dirty || !valid || working}>Save</button>
      </form>
      {!valid && <span className="sec-err">That doesn't look like a GitHub repo. Use something like github.com/you/ihatebills.</span>}
      <label className="sec-ack">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span>Check for updates when the app opens</span>
      </label>

      {status.kind === "current" && <span className="sec-ok">You're on the latest version.</span>}
      {status.kind === "error" && <span className="sec-err">{status.message}</span>}
      {(status.kind === "available" || status.kind === "installing") && (
        <div className="upd-card">
          <b>Version {status.info.version} is available</b>
          <span className="muted">You have {status.info.currentVersion}.</span>
          {status.info.notes && <pre className="upd-notes">{status.info.notes}</pre>}
        </div>
      )}
      {status.kind === "installing" && (
        <>
          <progress className="upd-bar" value={status.total ? status.done : undefined} max={status.total ?? undefined} />
          <span className="muted">
            {status.verifying ? "Installing… the app will restart by itself."
              : status.total ? `Downloading… ${mb(status.done)} of ${mb(status.total)} MB` : "Downloading…"}
          </span>
        </>
      )}

      <div className="tb-line">
        <span className="spacer" />
        {status.kind === "available" || status.kind === "installing" ? (
          <button className="btn primary" onClick={runInstall} disabled={working}>Install and restart</button>
        ) : (
          <button className="btn" onClick={() => void check()} disabled={!repo || dirty || working}>
            {status.kind === "checking" ? "Checking…" : "Check for updates"}
          </button>
        )}
      </div>
    </section>
  );
}
