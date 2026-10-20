// Read-only view of the selected bill: its scan on top, the data laid out below.
import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { billTitle, display, formatDate } from "../../lib/format";
import { StatusPill } from "../ui/StatusPill";
import { formatCents } from "../../lib/money";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { Bill, FieldDef } from "../../types";
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

function Ledger({ bill, defs }: { bill: Bill; defs: Map<string, FieldDef> }) {
  const row = (key: string, kind: "" | "sub" | "total" = "") => {
    const v = cents(bill, key);
    if (v === null) return null;
    return (
      <div key={key} className={`vw-ledger-row ${kind}`}>
        <span>{defs.get(key)?.label ?? key}</span>
        <span className="mono">{formatCents(v)}</span>
      </div>
    );
  };
  const rows = [
    row("claimTotal", "total"),
    row("notYourResponsibility", "sub"),
    row("paidByPlan", "sub"),
    row("discounts", "sub"),
    row("paidByAnotherSource", "sub"),
    row("yourResponsibility", "total"),
    row("copay", "sub"),
    row("appliedTowardsDeductible", "sub"),
    row("coinsurance", "sub"),
    row("amountNotCovered", "sub"),
  ].filter(Boolean);
  if (!rows.length) return <div className="vw-none">No amounts entered yet.</div>;
  return <div className="vw-ledger">{rows}</div>;
}

const SHOWN_ELSEWHERE = new Set([
  "from", "to", "memberName", "providerName", "status",
  "claimTotal", "notYourResponsibility", "paidByPlan", "discounts", "paidByAnotherSource",
  "yourResponsibility", "copay", "appliedTowardsDeductible", "coinsurance", "amountNotCovered",
]);

function Details({ bill, fieldDefs }: { bill: Bill; fieldDefs: FieldDef[] }) {
  const category = useDb((s) => s.categories.find((c) => c.id === bill.categoryId)?.name);
  const items = fieldDefs
    .filter((d) => !SHOWN_ELSEWHERE.has(d.key))
    .map((d) => ({ label: d.label, value: display(d, bill.values[d.key]), mono: d.type !== "text" && d.type !== "status" }))
    .filter((x) => x.value);
  items.unshift({ label: "Category", value: category ?? "Uncategorized", mono: false });
  return (
    <dl className="vw-details">
      {items.map((x) => <div key={x.label}><dt>{x.label}</dt><dd className={x.mono ? "mono" : ""}>{x.value}</dd></div>)}
    </dl>
  );
}

function Summary({ bill }: { bill: Bill }) {
  const fieldDefs = useDb((s) => s.fieldDefs);
  const defs = new Map(fieldDefs.map((d) => [d.key, d]));
  const v = bill.values;
  const status = (v.status as string) || "";
  const from = v.from ? formatDate(v.from as string) : null;
  const to = v.to && v.to !== v.from ? formatDate(v.to as string) : null;
  const owe = cents(bill, "yourResponsibility");
  const total = cents(bill, "claimTotal");
  return (
    <div className="vw-summary">
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
        <Ledger bill={bill} defs={defs} />
      </section>
      <section>
        <h4 className="label">Details</h4>
        <Details bill={bill} fieldDefs={fieldDefs} />
      </section>
    </div>
  );
}

export function Viewer() {
  const selectedId = useUi((s) => s.selectedId);
  const bill = useDb((s) => s.bills.find((b) => b.id === selectedId));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="viewer" title="Viewer">
        {bill && <span className="insp-title">{billTitle(bill)}</span>}
        <span className="spacer" />
      </PaneHead>
      {!bill ? (
        <div className="empty"><span className="big">No bill selected</span><span>Pick a bill on the list to see its scan and a summary.</span></div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <PanelGroup direction="vertical" autoSaveId="ihatebills-viewer">
            <Panel defaultSize={55} minSize={12}><Scan bill={bill} /></Panel>
            <PanelResizeHandle className="resize-handle v" />
            <Panel minSize={20}><div className="scroll" style={{ height: "100%" }}><Summary bill={bill} /></div></Panel>
          </PanelGroup>
        </div>
      )}
    </div>
  );
}
