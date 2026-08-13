import { useEffect } from "react";

export default function Modal({ children, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
    >
      <div className="card card-pad" role="dialog" aria-modal="true" style={{ maxWidth: 920, width: "92%", maxHeight: "86%", overflowY: "auto", position: "relative" }}>
        {children}
      </div>
    </div>
  );
}
