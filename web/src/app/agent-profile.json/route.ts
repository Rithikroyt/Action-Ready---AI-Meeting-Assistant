import { agentProfile } from "@/lib/visibility/core";

// Public, machine-readable ActionReady profile for AI agents (Week 5). No sign-in, no secrets, only true statements.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(agentProfile(), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "all",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
