"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="auth">
      <div className="card">
        <div className="empty">
          <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
          <p className="muted">The page could not be rendered. No meeting was submitted or changed by this error.</p>
          <button className="btn" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
