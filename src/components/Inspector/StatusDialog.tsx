import { useState } from "react";
import { STATUS_COLORS, statusColor } from "../../lib/format";
import { useDb } from "../../store/db";
import type { StatusColor } from "../../types";
import { Dialog } from "../ui/Dialog";

interface Row { name: string; color: StatusColor }

export function StatusDialog({ onClose }: { onClose(): void }) {
  const [list, setList] = useState<Row[]>(() => {
    const { statuses, statusColors } = useDb.getState();
    return statuses.map((name) => ({ name, color: statusColor(name, statusColors) }));
  });
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState<number | null>(null);
  const add = () => { const t = draft.trim(); if (t && !list.some((r) => r.name === t)) setList([...list, { name: t, color: statusColor(t, {}) }]); setDraft(""); };
  const edit = (i: number, patch: Partial<Row>) => setList(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () => {
    // Keep colors for removed statuses so bills that still use them keep their pill color.
    const colors = { ...useDb.getState().statusColors };
    for (const r of list) colors[r.name] = r.color;
    useDb.getState().setStatuses(list.map((r) => r.name), colors);
    onClose();
  };
  return (
    <Dialog title="Status options" onClose={onClose}
      footer={<><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      {list.map((r, i) => (
        <div key={r.name}>
          <div className="tb-line">
            <button className={`swatch c-${r.color}`} onClick={() => setPicking(picking === i ? null : i)} title="Color" />
            <input className="input" style={{ flex: 1 }} defaultValue={r.name} onBlur={(e) => { const v = e.target.value.trim(); if (v) edit(i, { name: v }); }} />
            <button className="icon-btn" disabled={i === 0} onClick={() => { setList(swap(list, i, i - 1)); setPicking(null); }} title="Move up">↑</button>
            <button className="icon-btn" disabled={i === list.length - 1} onClick={() => { setList(swap(list, i, i + 1)); setPicking(null); }} title="Move down">↓</button>
            <button className="icon-btn danger" onClick={() => { setList(list.filter((_, j) => j !== i)); setPicking(null); }} title="Remove">✕</button>
          </div>
          {picking === i && (
            <div className="swatches">
              {STATUS_COLORS.map((c) => (
                <button key={c} className={`swatch c-${c} ${c === r.color ? "on" : ""}`} title={c} onClick={() => { edit(i, { color: c }); setPicking(null); }} />
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="tb-line">
        <input className="input" style={{ flex: 1 }} placeholder="New status…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" onClick={add}>Add</button>
      </div>
      <span className="tb-hint">Bills keep their current status even if you remove it from this list.</span>
    </Dialog>
  );
}

function swap<T>(a: T[], i: number, j: number) {
  const b = [...a];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
}
