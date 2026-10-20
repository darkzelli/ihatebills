import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { extOf, IMPORT_EXTENSIONS } from "../../lib/import";
import * as storage from "../../lib/storage";
import * as core from "../../lib/tauri";
import { useDb } from "../../store/db";
import type { Attachment, Bill } from "../../types";
import { Dialog } from "../ui/Dialog";
import { PdfView, ScanControls, useZoom } from "../ui/ScanView";

const ALLOWED = /\.(pdf|png|jpe?g)$/i;

/** A blob: URL of the scan's decrypted bytes, revoked on unmount; they never touch the disk. */
export function useUrl(a: Attachment) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    let made: string | null = null;
    setUrl(null);
    storage.readAttachment(a)
      .then((data) => { if (!dead) setUrl(made = URL.createObjectURL(new Blob([data], { type: a.mime }))); })
      .catch(() => { if (!dead) setUrl(null); });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [a]);
  return url;
}

/** Thumbnail, or with `zoom` the full scan (PDFs drawn by pdf.js). */
export function Preview({ a, zoom }: { a: Attachment; zoom?: number }) {
  const url = useUrl(a);
  if (!url) return null;
  if (a.mime === "application/pdf") return zoom ? <PdfView url={url} zoom={zoom} /> : <PdfView url={url} thumb />;
  return <img src={url} alt={a.name} draggable={false} />;
}

export function Attachments({ bill, onError }: { bill: Bill; onError(msg: string): void }) {
  const [hot, setHot] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const { addAttachment, removeAttachment, moveAttachment } = useDb.getState();
  const encrypted = storage.useVault((s) => s.status === "on");

  const importPaths = async (paths: string[]) => {
    for (const p of paths) {
      if (IMPORT_EXTENSIONS.includes(extOf(p))) continue; // the bill list imports these
      if (!ALLOWED.test(p)) { onError(`Only PDF, PNG and JPEG files can be attached: ${p.split(/[\\/]/).pop()}`); continue; }
      try { addAttachment(bill.id, await storage.addAttachment(p.split(/[\\/]/).pop()!, await core.readScanFile(p))); } catch (e) { onError(String(e)); }
    }
  };

  // Files dropped anywhere on the window attach to the selected bill.
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") setHot(true);
      else if (e.payload.type === "leave") setHot(false);
      else if (e.payload.type === "drop") { setHot(false); importPaths(e.payload.paths); }
    });
    return () => { un.then((f) => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id]);

  const pick = async () => {
    const sel = await open({ multiple: true, filters: [{ name: "Scans", extensions: ["pdf", "png", "jpg", "jpeg"] }] });
    if (sel) importPaths(Array.isArray(sel) ? sel : [sel]);
  };
  const remove = async (a: Attachment) => {
    if (await ask(`Remove “${a.name}” from this bill? The copy stored by ihatebills is deleted.`, { title: "Remove scan", kind: "warning" })) removeAttachment(bill.id, a.id);
  };
  const openExternal = async (a: Attachment) => {
    try { await openPath(await core.attachmentPath(a.file)); } catch (e) { onError(String(e)); }
  };

  return (
    <>
      {bill.attachments.length > 0 && (
        <div className="thumbs">
          {bill.attachments.map((a, i) => (
            <div key={a.id} className="thumb" onClick={() => setViewing(a)} title="Click to view">
              <div className="pic">
                <Preview a={a} />
                {bill.attachments.length > 1 && (
                  <span className="thumb-move" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => moveAttachment(bill.id, a.id, -1)}>↑</button>
                    <button className="icon-btn" title="Move down" disabled={i === bill.attachments.length - 1} onClick={() => moveAttachment(bill.id, a.id, 1)}>↓</button>
                  </span>
                )}
              </div>
              <div className="meta">
                <span>{a.name}</span>
                {!encrypted && <button className="icon-btn" title="Open in default app" onClick={(e) => { e.stopPropagation(); openExternal(a); }}>↗</button>}
                <button className="icon-btn danger" title="Remove" onClick={(e) => { e.stopPropagation(); remove(a); }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={`drop-zone ${hot ? "hot" : ""}`}>
        <span>{hot ? "Drop to attach" : "Drop a PDF, PNG or JPEG scan here"}</span>
        <button className="btn sm" onClick={pick}>Choose file…</button>
      </div>
      {viewing && <ScanDialog a={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** Full-window scan with its controls beside the close button. */
export function ScanDialog({ a, onClose }: { a: Attachment; onClose(): void }) {
  const [zoom, setZoom] = useZoom(a.id);
  return (
    <Dialog className="viewer" onClose={onClose} title={<span className="viewer-name">{a.name}</span>}
      actions={<ScanControls a={a} zoom={zoom} setZoom={setZoom} />}>
      <Preview a={a} zoom={zoom} />
    </Dialog>
  );
}
