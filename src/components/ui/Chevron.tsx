/** Disclosure chevron: points down when open, right when collapsed. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chev ${open ? "" : "closed"}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
