"use client";

import { useEffect } from "react";

/** Opens the browser print dialog once the label has rendered. */
export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print" style={{ textAlign: "center", padding: "16px" }}>
      <button
        onClick={() => window.print()}
        style={{
          background: "#6c4d39",
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          border: "none",
          borderRadius: 10,
          padding: "10px 20px",
          cursor: "pointer",
        }}
      >
        Print label
      </button>
      <p style={{ color: "#8a7559", fontSize: 13, marginTop: 8 }}>
        Pick your 4×6 thermal printer in the dialog. This tab can be closed after printing.
      </p>
    </div>
  );
}
