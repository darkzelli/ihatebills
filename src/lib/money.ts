const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const num = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** "$1,234.56" for integer cents. */
export const formatCents = (c: number) => fmt.format(c / 100);
export const formatNumber = (n: number) => num.format(n);

/** Parses what a person types ("$1,234.5", "(12)", "-3") into cents; null if blank or not a number. */
export function parseCents(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || t.includes("-");
  const clean = t.replace(/[^0-9.]/g, "");
  if (!clean || clean.split(".").length > 2) return null;
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}

/** Cents → plain editable text ("1234.50"). */
export const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

/** Drops anything that can't be part of a number as it's typed; money also allows "$" and "(...)" negatives. */
export const numericOnly = (s: string, money = false) => s.replace(money ? /[^0-9.,\-$()]/g : /[^0-9.,\-]/g, "");
