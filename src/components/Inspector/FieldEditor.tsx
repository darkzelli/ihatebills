import { useEffect, useState } from "react";
import { centsToInput, parseCents } from "../../lib/money";
import { useDb } from "../../store/db";
import type { FieldDef, FieldValue } from "../../types";

/** Text box that keeps what's typed locally and commits on blur / Enter. */
function CommitInput({ value, commit, className, placeholder }: { value: string; commit(s: string): void; className?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input className={`input ${className ?? ""}`} value={text} placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
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
      return <CommitInput className="num" placeholder="$0.00" value={centsToInput(value as number | null)}
        commit={(s) => { const c = parseCents(s); if (c !== null || !s.trim()) onChange(c); }} />;
    case "number":
      return <CommitInput className="num" placeholder="0" value={value == null ? "" : String(value)}
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
