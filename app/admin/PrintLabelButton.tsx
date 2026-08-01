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
      // The label is a real 4x6 PDF now. Load it into a hidden iframe as a blob URL
      // and print THAT — the browser renders the PDF at its exact page size. (Older
      // versions wrote the response as HTML via srcdoc, which dumped raw PDF bytes.)
      const res = await fetch(href);
      if (!res.ok) throw new Error("bad");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:420px;height:640px;border:0;";
      document.body.appendChild(iframe);

      const cleanup = () => {
        setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 2000);
      };
      iframe.onload = () => {
        const w = iframe.contentWindow;
        if (!w) return cleanup();
        // Small delay so the PDF viewer finishes laying out before the print call.
        setTimeout(() => {
          try { w.focus(); w.print(); } catch { window.open(url, "_blank"); }
          cleanup();
        }, 350);
      };
      iframe.src = url;
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
