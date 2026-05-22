"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#09090b", color: "#fff", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "#71717a", fontSize: "0.75rem", fontFamily: "monospace" }}>
            {error.digest}
          </p>
          <p style={{ fontWeight: 600, marginTop: "0.5rem" }}>Something went wrong</p>
          <button
            onClick={reset}
            style={{ marginTop: "1rem", background: "#27272a", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "0.5rem", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
