import Link from "next/link";

/** Opens the narrated in-app demo video (/demo-video). */
export function DemoVideoButton({ className = "btn", label = "Demo video", compact = false }: { className?: string; label?: string; compact?: boolean }) {
  return (
    <Link href="/demo-video" className={`${className} demo-video-btn ${compact ? "compact" : ""}`} aria-label="Watch the demo video">
      <span className="dvb-play" aria-hidden>
        <svg viewBox="0 0 24 24" width="12" height="12">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
      </span>
      <span className="dvb-label">{label}</span>
    </Link>
  );
}
