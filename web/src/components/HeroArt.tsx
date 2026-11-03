// Animated hero illustration for the landing page: meeting notes flow through the writer, the reviewer and the
// register / capacity check into a readiness result. Decorative and clearly labelled as a synthetic example.
export function HeroArt() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 560 470"
      role="img"
      aria-label="Illustration: meeting notes flow through an AI writer, an AI reviewer and a register and capacity check into a readiness result — synthetic example showing 6 hours existing plus 4 hours new against 8 hours capacity, so the plan is blocked."
    >
      <defs>
        <radialGradient id="ha-peach" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffc9a8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffc9a8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ha-lav" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c9b8ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#c9b8ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ha-lime" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#d8f57a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#d8f57a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ha-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d4aff" />
          <stop offset="0.55" stopColor="#b06bff" />
          <stop offset="1" stopColor="#ff8a65" />
        </linearGradient>
        <filter id="ha-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#5a2d8c" floodOpacity="0.18" />
        </filter>
        <pattern id="ha-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#ff6347" />
          <rect width="3" height="6" fill="#ff8a70" />
        </pattern>
      </defs>

      {/* glow blobs */}
      <circle className="ha-blob b1" cx="120" cy="110" r="150" fill="url(#ha-lav)" />
      <circle className="ha-blob b2" cx="450" cy="120" r="140" fill="url(#ha-peach)" />
      <circle className="ha-blob b3" cx="400" cy="380" r="150" fill="url(#ha-lime)" />

      {/* connectors */}
      <path className="ha-flow" d="M210 120 C 260 120, 250 62, 298 62" />
      <path className="ha-flow" d="M380 100 C 400 150, 330 170, 300 196" style={{ animationDelay: "-0.6s" }} />
      <path className="ha-flow" d="M250 250 C 200 280, 190 300, 200 322" style={{ animationDelay: "-1.2s" }} />

      {/* meeting notes card */}
      <g className="ha-float f1" filter="url(#ha-shadow)">
        <rect x="24" y="44" width="186" height="150" rx="18" fill="#fff" />
        <rect x="42" y="64" width="26" height="26" rx="8" fill="#f1ecff" />
        <path d="M49 72h12M49 77h12M49 82h8" stroke="#6d4aff" strokeWidth="2" strokeLinecap="round" />
        <text x="78" y="76" className="ha-t strong">Meeting notes</text>
        <text x="78" y="90" className="ha-t sub">Atlas · 2–6 Nov</text>
        <rect x="42" y="108" width="150" height="7" rx="3.5" fill="#efe6f5" />
        <rect x="42" y="124" width="122" height="7" rx="3.5" fill="#efe6f5" />
        <rect x="38" y="137" width="160" height="20" rx="6" fill="#ecfab9" className="ha-highlight" />
        <rect x="44" y="144" width="140" height="7" rx="3.5" fill="#9ccb12" opacity="0.55" />
        <rect x="42" y="168" width="96" height="7" rx="3.5" fill="#efe6f5" />
      </g>

      {/* writer + reviewer nodes */}
      <g className="ha-float f2" filter="url(#ha-shadow)">
        <rect x="298" y="30" width="250" height="66" rx="18" fill="#fff" />
        <circle cx="328" cy="63" r="16" fill="url(#ha-brand)" />
        <path d="M321 63l5 5 9-10" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="354" y="58" className="ha-t strong">AI writer → AI reviewer</text>
        <text x="354" y="76" className="ha-t sub">Draft checked against the notes</text>
      </g>

      {/* tools node */}
      <g className="ha-float f3" filter="url(#ha-shadow)">
        <rect x="150" y="196" width="230" height="58" rx="18" fill="#fff" />
        <rect x="166" y="210" width="30" height="30" rx="9" fill="#fff3ea" />
        <ellipse cx="181" cy="218" rx="8" ry="3" fill="none" stroke="#ff6347" strokeWidth="1.8" />
        <path d="M173 218v12c0 1.7 3.6 3 8 3s8-1.3 8-3v-12" fill="none" stroke="#ff6347" strokeWidth="1.8" />
        <text x="206" y="221" className="ha-t strong">Register + capacity</text>
        <text x="206" y="238" className="ha-t sub">3 observed tool calls</text>
      </g>

      {/* readiness result */}
      <g className="ha-float f4" filter="url(#ha-shadow)">
        <rect x="120" y="322" width="330" height="122" rx="20" fill="#fff" />
        <rect x="140" y="340" width="98" height="26" rx="13" fill="#fff0f2" />
        <circle cx="155" cy="353" r="6" fill="#b8123a" />
        <path d="M152.5 350.5l5 5M157.5 350.5l-5 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <text x="167" y="357.5" className="ha-t blocked">Blocked</text>
        <text x="250" y="357.5" className="ha-t sub">Maya · 10 h vs 8 h</text>
        <rect x="140" y="384" width="290" height="16" rx="8" fill="#f6f0f8" />
        <rect className="ha-grow g1" x="140" y="384" width="150" height="16" rx="8" fill="#8b6dff" />
        <rect className="ha-grow g2" x="290" y="384" width="51" height="16" fill="#b5e212" />
        <rect className="ha-grow g3" x="341" y="384" width="50" height="16" rx="0" fill="url(#ha-hatch)" />
        <rect x="339" y="378" width="3" height="28" rx="1.5" fill="#1f1430" />
        <text x="140" y="424" className="ha-t sub">6 h existing + 4 h new · capacity 8 h · margin −2 h</text>
      </g>

      {/* floating chips */}
      <g className="ha-float f5">
        <rect x="430" y="214" width="112" height="30" rx="15" fill="#f1ecff" stroke="#d9ccff" />
        <text x="446" y="233" className="ha-t chip">AI review · Pass</text>
      </g>
      <g className="ha-float f6">
        <rect x="18" y="262" width="122" height="30" rx="15" fill="#fff3ea" stroke="#ffd9c2" />
        <text x="33" y="281" className="ha-t chip">Approval · Not given</text>
      </g>
      <text x="300" y="462" textAnchor="middle" className="ha-t caption">
        Synthetic example
      </text>
    </svg>
  );
}
