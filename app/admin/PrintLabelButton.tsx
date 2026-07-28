"use client";

import { useState } from "react";

/**
 * Click → print. Fetches a standalone 4x6 label document and prints it through a
 * hidden iframe, so ONLY the label goes to the printer — no app chrome, no new tab,
 * no separate page. Same-tab, one click.
 */
export default function PrintLabelButton({
  href,
  label = "Print label",
  className = "",
}: {
  href: string; // /api/admin/label?...
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const print = async () => {
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error("bad");
      const html = await res.text();

      // Off-screen but with a REAL size — a 0x0 iframe lays the label out at zero
      // width and prints it tiny. Give it a 4x6-ish box so it renders full size.
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:420px;height:640px;border:0;";
      document.body.appendChild(iframe);

      const cleanup = () => {
        setTimeout(() => iframe.remove(), 1500);
      };
      iframe.onload = () => {
        const w = iframe.contentWindow;
        if (!w) return cleanup();
        w.focus();
        w.print();
        cleanup();
      };
      iframe.srcdoc = html;
    } catch {
      alert("Couldn't build the label. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={print} disabled={busy} className={className}>
      {busy ? "…" : label}
    </button>
  );
}
