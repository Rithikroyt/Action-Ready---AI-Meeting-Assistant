import type { MetadataRoute } from "next";

// Crawlers (including AI agents) may read the public product page and the agent profile only.
// Every workspace route stays disallowed and also carries a noindex robots meta tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/agent-profile.json"], disallow: ["/dashboard", "/cases", "/meetings", "/team", "/visibility", "/login", "/api"] }],
  };
}
