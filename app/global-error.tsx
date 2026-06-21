"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: "#030712", color: "#fff", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ textAlign: "center", maxWidth: "360px", width: "100%" }}>
            <div style={{ color: "#6f8a4f", fontWeight: 800, fontSize: "20px", marginBottom: "24px" }}>Northwood Bids</div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ color: "#9ca3af", fontSize: "14px", margin: "0 0 32px" }}>
              We hit an unexpected error. Please try again.
            </p>
            <button
              onClick={reset}
              style={{ width: "100%", background: "#10b981", color: "#fff", fontWeight: 600, padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
