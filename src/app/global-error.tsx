"use client";

// Root-level error boundary (replaces the whole document).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>{error.digest ? `Reference: ${error.digest}` : "Please try again."}</p>
          <button onClick={reset} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
