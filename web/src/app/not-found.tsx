import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth">
      <div className="card">
        <div className="empty">
          <h1 style={{ fontSize: 18 }}>Page not found</h1>
          <p className="muted">That page or case does not exist for this account.</p>
          <Link href="/" className="btn">
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
