// Read-only view of the selected bill: its scan and the data laid out around it, the scan placed
// above or below to match where the Scans section sits in the inspector.
import { ask } from "@tauri-apps/plugin-dialog";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type ImperativePanelHandle, Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { billTitle, display, formatDate } from "../../lib/format";
import { StatusPill } from "../ui/StatusPill";
import { formatCents } from "../../lib/money";
import { leafFields } from "../../fields";
import { oweAmount } from "../../lib/controls";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { Bill, FieldDef } from "../../types";
import { ControlsDialog } from "../Controls/ControlsDialog";
import { Preview, ScanDialog } from "../Inspector/Attachments";
import { PaneHead } from "../ui/PaneHead";
import { ScanControls, useZoom } from "../ui/ScanView";

const cents = (b: Bill, key: string) => (typeof b.values[key] === "number" ? (b.values[key] as number) : null);

function Scan({ bill }: { bill: Bill }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const active = bill.attachments.find((a) => a.id === activeId) ?? bill.attachments[0];
  const [zoom, setZoom] = useZoom(active?.id);
  useEffect(() => setActiveId(null), [bill.id]);

  if (!active) {
    return <div className="vw-scan vw-noscan"><span className="big">No scan attached</span><span>Drop a PDF or image on the window to attach one.</span></div>;
  }
  return (
    <div className="vw-scan">
      <div className="vw-scan-bar">
        {bill.attachments.length > 1 ? (
          <div className="seg">
            {bill.attachments.map((a, i) => (
              <button key={a.id} className={a.id === active.id ? "on" : ""} title={a.name} onClick={() => setActiveId(a.id)}>{i + 1}</button>
            ))}
          </div>
        ) : null}
        <span className="vw-scan-name">{active.name}</span>
        <ScanControls a={active} zoom={zoom} setZoom={setZoom}>
          <button className="icon-btn" title="View larger" onClick={() => setBig(true)}>⤢</button>
        </ScanControls>
      </div>
      <div className="vw-scan-doc" onDoubleClick={() => setBig(true)}><Preview key={active.id} a={active} zoom={zoom} /></div>
      {big && <ScanDialog a={active} onClose={() => setBig(false)} />}
    </div>
  );
}

/** Runs a control on the shown bill and offers undo; provided by Summary. */
const RunContext = createContext<(controlId: string) => void>(() => {});

/** The control buttons assigned to a field. */
function ControlButtons({ fieldKey }: { fieldKey: string }) {
  const controls = useDb((s) => s.controls);
  const run = useContext(RunContext);
  const mine = controls.filter((c) => c.fields.includes(fieldKey));
  if (!mine.length) return null;
  return (
    <span className="vw-ctls">
      {mine.map((c) => <button key={c.id} className="btn sm vw-ctl" onClick={() => run(c.id)} title={`Run “${c.label}”`}>{c.label}</button>)}
    </span>
  );
}

/** Whether a field has control buttons, so it shows even while blank. */
const useHasControls = () => {
  const controls = useDb((s) => s.controls);
  return (key: string) => controls.some((c) => c.fields.includes(key));
};
const lookClass = (bill: Bill, key: string) => (bill.looks?.[key] === "dim" ? "vw-dimmed" : "");

/** Where the claim total went: plan, discounts, other payers, and you. */
function Breakdown({ bill }: { bill: Bill }) {
  const total = cents(bill, "claimTotal");
  const parts = [
    { key: "paidByPlan", label: "Plan paid", tone: "info" },
    { key: "discounts", label: "Discounts", tone: "ok" },
    { key: "paidByAnotherSource", label: "Other source", tone: "muted" },
    { key: "yourResponsibility", label: "You owe", tone: "warn" },
  ].map((p) => ({ ...p, v: Math.max(0, cents(bill, p.key) ?? 0) })).filter((p) => p.v > 0);
  const sum = parts.reduce((n, p) => n + p.v, 0);
  const base = Math.max(total ?? 0, sum);
  if (!base || !parts.length) return null;
  return (
    <div className="vw-bar-wrap">
      <div className="vw-bar">
        {parts.map((p) => <span key={p.key} className={`vw-seg ${p.tone}`} style={{ width: `${(p.v / base) * 100}%` }} title={`${p.label}: ${formatCents(p.v)}`} />)}
      </div>
      <div className="vw-legend">
        {parts.map((p) => <span key={p.key}><i className={`vw-dot ${p.tone}`} />{p.label} <b className="mono">{Math.round((p.v / base) * 100)}%</b></span>)}
      </div>
    </div>
  );
}

const LEDGER = new Set([
  "claimTotal", "notYourResponsibility", "paidByPlan", "discounts", "paidByAnotherSource",
  "yourResponsibility", "copay", "appliedTowardsDeductible", "coinsurance", "amountNotCovered",
]);
const LEDGER_TOTALS = new Set(["claimTotal", "yourResponsibility"]);

/** The amounts, in the order they're arranged in the inspector. */
function Ledger({ bill, fieldDefs }: { bill: Bill; fieldDefs: FieldDef[] }) {
  const hasControls = useHasControls();
  const rows = fieldDefs.filter((d) => LEDGER.has(d.key) && bill.looks?.[d.key] !== "hide" && (cents(bill, d.key) !== null || hasControls(d.key)));
  if (!rows.length) return <div className="vw-none">No amounts entered yet.</div>;
  return (
    <div className="vw-ledger">
      {rows.map((d) => {
        const v = cents(bill, d.key);
        return (
          <div key={d.key} className={`vw-ledger-row ${LEDGER_TOTALS.has(d.key) ? "total" : "sub"} ${lookClass(bill, d.key)}`}>
            <span>{d.label}</span>
            <span className="vw-ledger-val">
              <ControlButtons fieldKey={d.key} />
              <span className="mono">{v === null ? "—" : formatCents(v)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SHOWN_ELSEWHERE = new Set(["from", "to", "memberName", "providerName", "status", ...LEDGER]);

function Details({ bill, fieldDefs }: { bill: Bill; fieldDefs: FieldDef[] }) {
  const category = useDb((s) => s.categories.find((c) => c.id === bill.categoryId)?.name);
  const hasControls = useHasControls();
  // Combined fields show as one item ("$120.00 · Nov 1, 2026") so their controls sit beside the whole thing.
  const shown = (d: FieldDef) => d.type === "combined"
    ? (d.parts ?? []).map((p) => display({ ...p, builtin: false, group: d.group }, bill.values[p.key])).filter(Boolean).join(" · ")
    : display(d, bill.values[d.key]);
  const items = fieldDefs
    .filter((d) => !SHOWN_ELSEWHERE.has(d.key) && bill.looks?.[d.key] !== "hide")
    .map((d) => ({ key: d.key, label: d.label, value: shown(d), mono: d.type !== "text" && d.type !== "status" }))
    .filter((x) => x.value || hasControls(x.key));
  items.unshift({ key: "", label: "Category", value: category ?? "Uncategorized", mono: false });
  return (
    <dl className="vw-details">
      {items.map((x) => (
        <div key={x.label} className={lookClass(bill, x.key)}>
          <dt>{x.label}</dt>
          <dd className={x.mono ? "mono" : ""}>{x.value || "—"}</dd>
          {x.key && <ControlButtons fieldKey={x.key} />}
        </div>
      ))}
    </dl>
  );
}

/** "Ran “Paid” · Undo" for a few seconds after a control runs. */
function useControlRunner(bill: Bill) {
  const [last, setLast] = useState<{ label: string; prev: Bill; same: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setLast(null); clearTimeout(timer.current); }, [bill.id]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async (controlId: string) => {
    const c = useDb.getState().controls.find((x) => x.id === controlId);
    if (!c) return;
    if (c.confirm && !(await ask(`Run “${c.label}” on this bill?`, { title: "Run control", okLabel: "Run" }))) return;
    const prev = useDb.getState().runControl(bill.id, c.id);
    if (!prev) return;
    const now = useDb.getState().bills.find((b) => b.id === bill.id);
    const same = JSON.stringify([prev.values, prev.looks ?? {}]) === JSON.stringify([now?.values, now?.looks ?? {}]);
    setLast({ label: c.label, prev, same });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLast(null), 8000);
  };
  const undo = () => { if (last) useDb.getState().restoreBill(last.prev); setLast(null); clearTimeout(timer.current); };
  return { run, last, undo, dismiss: () => setLast(null) };
}

function Summary({ bill }: { bill: Bill }) {
  const allDefs = useDb((s) => s.fieldDefs);
  const sectionOrder = useUi((s) => s.sectionOrder);
  // Same order as the inspector: by section, then by field within it.
  const topDefs = useMemo(
    () => [...allDefs].sort((a, b) => sectionOrder.indexOf(a.group) - sectionOrder.indexOf(b.group)),
    [allDefs, sectionOrder],
  );
  const fieldDefs = leafFields(topDefs);
  const { run, last, undo, dismiss } = useControlRunner(bill);
  const looked = Object.keys(bill.looks ?? {}).filter((k) => topDefs.some((d) => d.key === k));
  const v = bill.values;
  const status = (v.status as string) || "";
  const from = v.from ? formatDate(v.from as string) : null;
  const to = v.to && v.to !== v.from ? formatDate(v.to as string) : null;
  const oweTerms = useDb((s) => s.owe);
  const owe = oweAmount(bill, oweTerms);
  const total = cents(bill, "claimTotal");
  return (
    <RunContext.Provider value={run}>
    <div className="vw-summary">
      {last && (
        <div className="vw-undo">
          <span className="spacer">{last.same ? `“${last.label}” didn't change anything — its conditions weren't met.` : `Ran “${last.label}”`}</span>
          {!last.same && <button className="btn sm" onClick={undo}>Undo</button>}
          <button className="icon-btn" onClick={dismiss} aria-label="Dismiss">✕</button>
        </div>
      )}
      <div className="vw-hero">
        <div className="vw-hero-main">
          <div className="vw-title">{billTitle(bill)}</div>
          <div className="vw-sub">
            {[from && (to ? `${from} – ${to}` : from), v.memberName as string].filter(Boolean).join(" · ") || "No visit details yet"}
          </div>
          {status && <StatusPill status={status} />}
        </div>
        <div className="vw-owe">
          <span className="label">You owe</span>
          <span className="vw-owe-amt mono">{owe === null ? "—" : formatCents(owe)}</span>
          {total !== null && <span className="dim mono">of {formatCents(total)} billed</span>}
        </div>
      </div>
      <Breakdown bill={bill} />
      <section>
        <h4 className="label">Amounts</h4>
        <Ledger bill={bill} fieldDefs={fieldDefs} />
      </section>
      <section>
        <h4 className="label">Details</h4>
        <Details bill={bill} fieldDefs={topDefs} />
      </section>
      {looked.length > 0 && (
        <div className="vw-looked">
          <span className="spacer">{looked.length} field{looked.length === 1 ? "" : "s"} greyed out or hidden by controls</span>
          <button className="btn sm ghost" onClick={() => looked.forEach((k) => useDb.getState().setLook(bill.id, k, null))}>Show all normally</button>
        </div>
      )}
    </div>
    </RunContext.Provider>
  );
}

export function Viewer() {
  const selectedId = useUi((s) => s.selectedId);
  const bill = useDb((s) => s.bills.find((b) => b.id === selectedId));
  const [controlsOpen, setControlsOpen] = useState(false);
  const order = useUi((s) => s.sectionOrder);
  const scanFirst = order.indexOf("Attachments") < order.length / 2;
  const group = useRef<HTMLDivElement>(null);
  const scanPanel = useRef<ImperativePanelHandle>(null);
  // Scrolling the summary past its end (toward the scan) grows the scan, so a squeezed scan can be
  // brought into view without finding the resize handle.
  const onSummaryWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const height = group.current?.clientHeight;
    const panel = scanPanel.current;
    if (!height || !panel) return;
    const atEnd = scanFirst ? e.deltaY < 0 && el.scrollTop <= 0 : e.deltaY > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (atEnd) panel.resize(panel.getSize() + (Math.abs(e.deltaY) / height) * 100);
  };
  const scan = <Panel key="scan" id="scan" ref={scanPanel} order={scanFirst ? 1 : 2} defaultSize={55} minSize={12}><Scan bill={bill!} /></Panel>;
  const summary = <Panel key="summary" id="summary" order={scanFirst ? 2 : 1} minSize={20}><div className="scroll" style={{ height: "100%" }} onWheel={onSummaryWheel}><Summary bill={bill!} /></div></Panel>;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="viewer" title="Viewer">
        {bill && <span className="insp-title">{billTitle(bill)}</span>}
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => setControlsOpen(true)} title="Buttons that change a bill's values or hide fields">Controls</button>
      </PaneHead>
      {controlsOpen && <ControlsDialog onClose={() => setControlsOpen(false)} />}
      {!bill ? (
        <div className="empty"><span className="big">No bill selected</span><span>Pick a bill on the list to see its scan and a summary.</span></div>
      ) : (
        <div ref={group} style={{ flex: 1, minHeight: 0 }}>
          {/* Separate saved sizes per arrangement, so flipping doesn't hand the scan the summary's height. */}
          <PanelGroup key={String(scanFirst)} direction="vertical" autoSaveId={scanFirst ? "ihatebills-viewer" : "ihatebills-viewer-scan-below"}>
            {scanFirst ? scan : summary}
            <PanelResizeHandle className="resize-handle v" />
            {scanFirst ? summary : scan}
          </PanelGroup>
        </div>
      )}
    </div>
  );
}
