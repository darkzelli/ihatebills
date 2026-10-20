import { statusColor } from "../../lib/format";
import { useDb } from "../../store/db";

export function StatusPill({ status }: { status: string }) {
  const color = useDb((s) => statusColor(status, s.statusColors));
  return <span className={`pill c-${color}`}>{status}</span>;
}
