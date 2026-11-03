// Re-mounts on every navigation, so each page animates in. Motion is removed under prefers-reduced-motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
