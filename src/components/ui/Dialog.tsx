import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function Dialog({ title, onClose, children, footer, actions, className = "" }: {
  title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode; actions?: ReactNode; className?: string;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return createPortal(
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog ${className}`} role="dialog" aria-modal>
        <div className="dialog-head">{title}<span className="spacer" />{actions}<button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
