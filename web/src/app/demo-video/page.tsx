import type { Metadata } from "next";
import { DemoVideo } from "./DemoVideo";
import "./demo-video.css";

export const metadata: Metadata = {
  title: "Demo video",
  description: "A narrated, animated end-to-end tour of ActionReady and its Week 5 AI Visibility Lab.",
  robots: { index: false, follow: false },
};

// Public on purpose: the tour contains no workspace data — only a labelled synthetic example and the published Week 5 measurements.
export default function DemoVideoPage() {
  return <DemoVideo />;
}
