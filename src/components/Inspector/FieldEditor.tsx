import { useEffect, useState } from "react";
import { centsToInput, numericOnly, parseCents } from "../../lib/money";
import { useDb } from "../../store/db";
import type { FieldDef, FieldValue } from "../../types";

/** Text box that keeps what's typed locally and commits on blur / Enter. */
function CommitInput({ value, commit, className, placeholder, clean }: {
  value: string; commit(s: string): void; className?: string; placeholder?: string; clean?(s: string): string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input className={`input ${className ?? ""}`} value={text} placeholder={placeholder} inputMode={clean ? "decimal" : undefined}
      onChange={(e) => setText(clean ? clean(e.target.value) : e.target.value)}
      onBlur={() => { if (text !== value) commit(text); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(value); e.currentTarget.blur(); } }} />
  );
}

export function FieldInput({ def, value, onChange, onEditStatuses }: {
  def: FieldDef; value: FieldValue | undefined; onChange(v: FieldValue): void; onEditStatuses(): void;
}) {
  const statuses = useDb((s) => s.statuses);
  switch (def.type) {
    case "money":
      return <CommitInput className="num" placeholder="$0.00" clean={(s) => numericOnly(s, true)} value={centsToInput(value as number | null)}
        commit={(s) => { const c = parseCents(s); if (c !== null || !s.trim()) onChange(c); }} />;
    case "number":
      return <CommitInput className="num" placeholder="0" clean={numericOnly} value={value == null ? "" : String(value)}
        commit={(s) => { const n = Number(s.replace(/,/g, "")); if (!s.trim()) onChange(null); else if (Number.isFinite(n)) onChange(n); }} />;
    case "date":
      return <input className="input" type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "status": {
      const v = (value as string) ?? "";
      return (
        <select className="input" value={v} onChange={(e) => (e.target.value === "__edit" ? onEditStatuses() : onChange(e.target.value || null))}>
          <option value="">—</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          {v && !statuses.includes(v) && <option value={v}>{v}</option>}
          <option value="__edit">Edit list…</option>
        </select>
      );
    }
    default:
      return <CommitInput value={(value as string) ?? ""} commit={(s) => onChange(s.trim() ? s : null)} />;
  }
}

/** Calendar button beside a date field: green when this bill's date shows on the schedule. */
export function ScheduleToggle({ on, onToggle }: { on: boolean; onToggle(): void }) {
  return (
    <button className={`icon-btn cal-toggle ${on ? "on" : ""}`} onClick={onToggle} aria-pressed={on}
      title={on ? "Shown on the schedule (click to hide)" : "Show this date on the schedule"}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        {on && <path d="m9 16 2 2 4-4" />}
      </svg>
    </button>
  );
}
