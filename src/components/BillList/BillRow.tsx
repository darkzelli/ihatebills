import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { billTitle, formatDate } from "../../lib/format";
import { StatusPill } from "../ui/StatusPill";
import { formatCents } from "../../lib/money";
import { useUi } from "../../store/ui";
import type { Bill } from "../../types";

export function BillRowView({ bill, selected, overlay, className = "", ...rest }: { bill: Bill; selected?: boolean; overlay?: boolean } & React.ComponentProps<"div">) {
  const v = bill.values;
  const owe = typeof v.yourResponsibility === "number" ? formatCents(v.yourResponsibility) : "—";
  const status = (v.status as string) || "";
  const sub = [v.from ? formatDate(v.from as string) : null, v.memberName as string, v.claimNumber ? `#${v.claimNumber}` : null].filter(Boolean).join(" · ");
  return (
    <div className={`bill ${selected ? "sel" : ""} ${overlay ? "bill-overlay" : ""} ${className}`} {...rest}>
      <span className="grip">⠿</span>
      <span className="bill-title">{billTitle(bill)}</span>
      <span className="bill-amt" title="Your Responsibility">{owe}</span>
      <span className="bill-sub">{sub || "No details yet"}</span>
      {status ? <StatusPill status={status} /> : <span />}
    </div>
  );
}

export function BillRow({ bill, disabled }: { bill: Bill; disabled: boolean }) {
  const selected = useUi((s) => s.selectedId === bill.id);
  const select = useUi((s) => s.select);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `b:${bill.id}`, disabled });
  return (
    <BillRowView
      bill={bill}
      selected={selected}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "dragging" : undefined}
      onClick={() => select(bill.id)}
      data-bill={bill.id}
      {...attributes}
      {...listeners}
    />
  );
}
