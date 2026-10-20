// Scan viewing: PDFs are drawn with pdf.js instead of WebKit's built-in viewer, so its
// floating zoom/download overlay never shows; our own controls sit in the scan bar instead.
import { save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { type ReactNode, useEffect, useRef, useState } from "react";
import * as storage from "../../lib/storage";
import * as core from "../../lib/tauri";
import { useDb } from "../../store/db";
import type { Attachment } from "../../types";

GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (dir: string) => new URL(`/pdfjs/${dir}/`, location.href).href;
const PAD = 12;
const MAX_PIXELS = 16_000_000; // WebKit refuses canvases much larger than this
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];

export function useZoom(resetKey: unknown) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [resetKey]);
  return [zoom, setZoom] as const;
}

function PdfPage({ doc, n, width }: { doc: PDFDocumentProxy; n: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    let dead = false;
    doc.getPage(n).then((page) => {
      const canvas = ref.current;
      if (dead || !canvas || width <= 0) return;
      const base = page.getViewport({ scale: 1 });
      const css = width / base.width;
      let px = css * devicePixelRatio;
      const area = base.width * base.height * px * px;
      if (area > MAX_PIXELS) px *= Math.sqrt(MAX_PIXELS / area);
      const vp = page.getViewport({ scale: px });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${base.height * css}px`;
      task = page.render({ canvas, viewport: vp });
      task.promise.catch(() => {}); // cancelled by a newer render
    });
    return () => { dead = true; task?.cancel(); };
  }, [doc, n, width]);
  return <canvas ref={ref} />;
}

/** All pages at `zoom` × the box width; `thumb` draws just the first page, edge to edge. */
export function PdfView({ url, zoom = 1, thumb }: { url: string; zoom?: number; thumb?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let dead = false;
    let task: ReturnType<typeof getDocument> | null = null;
    setDoc(null);
    setFailed(false);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => {
        if (dead) return null;
        task = getDocument({
          data,
          cMapUrl: asset("cmaps"),
          standardFontDataUrl: asset("standard_fonts"),
          wasmUrl: asset("wasm"),
          iccUrl: asset("iccs"),
        });
        return task.promise;
      })
      .then((d) => { if (d && !dead) setDoc(d); })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; task?.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(0, Math.floor((width - (thumb ? 0 : PAD * 2)) * zoom));
  const pages = doc ? (thumb ? 1 : doc.numPages) : 0;
  return (
    <div className={`pdf-view ${thumb ? "thumb-pdf" : ""}`} ref={box}>
      {failed ? <div className="pdf-msg">{thumb ? "PDF" : "Couldn't display this PDF. Try saving a copy and opening that."}</div>
        : Array.from({ length: pages }, (_, i) => <PdfPage key={i} doc={doc!} n={i + 1} width={pageWidth} />)}
    </div>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ZOOM_OUT = "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM21 21l-5.2-5.2M7.5 10.5h6";
const ZOOM_IN = `${ZOOM_OUT}M10.5 7.5v6`;
const DOWNLOAD = "M12 4v11M7 10l5 5 5-5M5 20h14";

/** Zoom (PDFs only), open in the default app, and save a copy. */
export function ScanControls({ a, zoom, setZoom, children }: {
  a: Attachment; zoom: number; setZoom(z: number): void; children?: ReactNode;
}) {
  // Opening in another app would need a plaintext copy on disk, so it's off while encrypted.
  const encrypted = storage.useVault((s) => s.status === "on");
  const fail = (e: unknown) => useDb.setState({ error: String(e) });
  const openExternal = async () => {
    try { await openPath(await core.attachmentPath(a.file)); } catch (e) { fail(e); }
  };
  const download = async () => {
    const ext = a.file.split(".").pop() ?? "";
    const dest = await save({ defaultPath: a.name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (dest) storage.readAttachment(a).then((data) => core.exportFile(dest, data)).catch(fail);
  };
  const i = ZOOMS.indexOf(zoom);
  const isPdf = a.mime === "application/pdf";
  return (
    <span className="scan-ctl">
      {isPdf && (
        <>
          <button className="icon-btn" title="Zoom out" disabled={i <= 0} onClick={() => setZoom(ZOOMS[i - 1])}><Icon d={ZOOM_OUT} /></button>
          <button className="scan-zoom mono" title="Fit to width" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button className="icon-btn" title="Zoom in" disabled={i >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[i + 1])}><Icon d={ZOOM_IN} /></button>
          <span className="scan-sep" />
        </>
      )}
      {children}
      {!encrypted && <button className="icon-btn" title="Open in default app" onClick={openExternal}>↗</button>}
      <button className="icon-btn" title="Save a copy…" onClick={download}><Icon d={DOWNLOAD} /></button>
    </span>
  );
}
