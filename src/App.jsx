import React, { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   STORAGE  (persists across sessions)
───────────────────────────────────────────── */
async function dbGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
async function dbSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function sessionGet(key) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function sessionSet(key, val) {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function sessionDel(key) {
  try { sessionStorage.removeItem(key); } catch {}
}

/* ─────────────────────────────────────────────
   CONSTANTS / HELPERS
───────────────────────────────────────────── */
const ROLES = { ADMIN: "admin", TEACHER: "teacher", STUDENT: "student" };
const TEST_STATUS = { SCHEDULED: "scheduled", LIVE: "live", ENDED: "ended" };

function fmt(s) {
  if (!s && s !== 0) return "--";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function fmtDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function getTestStatus(test) {
  if (!test.scheduledAt) return TEST_STATUS.LIVE;
  const now = Date.now();
  const start = new Date(test.scheduledAt).getTime();
  const end = start + (test.durationMins || 180) * 60000;
  if (now < start) return TEST_STATUS.SCHEDULED;
  if (now >= start && now <= end) return TEST_STATUS.LIVE;
  return TEST_STATUS.ENDED;
}

function getUrlParam(key) {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || window.location.search);
  return params.get(key);
}
function buildShareUrl(testId) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?testId=${testId}`;
}
function buildResultUrl(testId, studentName) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?result=${encodeURIComponent(testId)}&student=${encodeURIComponent(studentName)}`;
}

/* ─────────────────────────────────────────────
   LATEX / MATH RENDERER
   Converts \frac, \sqrt, \times, \alpha etc → readable Unicode
───────────────────────────────────────────── */
function renderMath(text) {
  if (!text) return text;
  let s = String(text);
  // \frac{a}{b} → (a/b) — run multiple passes for nested fracs
  for (let i = 0; i < 6; i++) s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1/$2)");
  // \sqrt{x} → √x
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, "√($1)");
  s = s.replace(/\\sqrt\s*(\S+)/g, "√$1");
  // Operators
  s = s.replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\pm/g, "±")
       .replace(/\\div/g, "÷").replace(/\\leq/g, "≤").replace(/\\geq/g, "≥")
       .replace(/\\neq/g, "≠").replace(/\\approx/g, "≈").replace(/\\infty/g, "∞")
       .replace(/\\rightarrow/g, "→").replace(/\\leftarrow/g, "←")
       .replace(/\\Rightarrow/g, "⇒").replace(/\\Leftarrow/g, "⇐")
       .replace(/\\leftrightarrow/g, "↔").replace(/\\propto/g, "∝")
       .replace(/\\perp/g, "⊥").replace(/\\parallel/g, "∥")
       .replace(/\\angle/g, "∠").replace(/\\triangle/g, "△")
       .replace(/\\degree/g, "°").replace(/\\circ/g, "°");
  // Greek lowercase
  s = s.replace(/\\alpha/g,"α").replace(/\\beta/g,"β").replace(/\\gamma/g,"γ")
       .replace(/\\delta/g,"δ").replace(/\\epsilon/g,"ε").replace(/\\varepsilon/g,"ε")
       .replace(/\\zeta/g,"ζ").replace(/\\eta/g,"η").replace(/\\theta/g,"θ")
       .replace(/\\vartheta/g,"θ").replace(/\\iota/g,"ι").replace(/\\kappa/g,"κ")
       .replace(/\\lambda/g,"λ").replace(/\\mu/g,"μ").replace(/\\nu/g,"ν")
       .replace(/\\xi/g,"ξ").replace(/\\pi/g,"π").replace(/\\varpi/g,"π")
       .replace(/\\rho/g,"ρ").replace(/\\varrho/g,"ρ").replace(/\\sigma/g,"σ")
       .replace(/\\tau/g,"τ").replace(/\\upsilon/g,"υ").replace(/\\phi/g,"φ")
       .replace(/\\varphi/g,"φ").replace(/\\chi/g,"χ").replace(/\\psi/g,"ψ")
       .replace(/\\omega/g,"ω");
  // Greek uppercase
  s = s.replace(/\\Gamma/g,"Γ").replace(/\\Delta/g,"Δ").replace(/\\Theta/g,"Θ")
       .replace(/\\Lambda/g,"Λ").replace(/\\Xi/g,"Ξ").replace(/\\Pi/g,"Π")
       .replace(/\\Sigma/g,"Σ").replace(/\\Upsilon/g,"Υ").replace(/\\Phi/g,"Φ")
       .replace(/\\Psi/g,"Ψ").replace(/\\Omega/g,"Ω");
  // Superscripts ^{...} and ^x
  s = s.replace(/\^\{([^{}]+)\}/g, (_, e) => e.split("").map(c=>({
    "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
    "+":"⁺","-":"⁻","n":"ⁿ","a":"ᵃ","b":"ᵇ","c":"ᶜ","x":"ˣ","y":"ʸ","z":"ᶻ"
  }[c]||("^"+c))).join(""));
  s = s.replace(/\^(\d)/g, (_, d) => ({"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹"}[d]||("^"+d)));
  // Subscripts _{...} and _x
  s = s.replace(/\_\{([^{}]+)\}/g, (_, e) => e.split("").map(c=>({
    "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
    "a":"ₐ","e":"ₑ","o":"ₒ","n":"ₙ","i":"ᵢ","r":"ᵣ","u":"ᵤ","v":"ᵥ","x":"ₓ"
  }[c]||("_"+c))).join(""));
  s = s.replace(/\_(\d)/g, (_, d) => ({"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉"}[d]||("_"+d)));
  // Integrals, sums
  s = s.replace(/\\int/g,"∫").replace(/\\oint/g,"∮").replace(/\\sum/g,"∑").replace(/\\prod/g,"∏");
  // Vectors, hats
  s = s.replace(/\\vec\{([^{}]+)\}/g,"$1⃗").replace(/\\hat\{([^{}]+)\}/g,"$1̂").replace(/\\bar\{([^{}]+)\}/g,"$1̄");
  // Brackets
  s = s.replace(/\\left\s*\(/g,"(").replace(/\\right\s*\)/g,")");
  s = s.replace(/\\left\s*\[/g,"[").replace(/\\right\s*\]/g,"]");
  s = s.replace(/\\left\s*\{/g,"{").replace(/\\right\s*\}/g,"}");
  s = s.replace(/\\left\s*\|/g,"|").replace(/\\right\s*\|/g,"|");
  s = s.replace(/\\langle/g,"⟨").replace(/\\rangle/g,"⟩");
  // Remove remaining braces used for grouping
  s = s.replace(/\{([^{}]*)\}/g,"$1");
  // \text{...} → ...
  s = s.replace(/\\text\s*\{([^{}]*)\}/g,"$1");
  // Remove $ delimiters
  s = s.replace(/\$\$([^$]+)\$\$/g,"$1").replace(/\$([^$]+)\$/g,"$1");
  // Remove remaining lone backslash commands
  s = s.replace(/\\([a-zA-Z]+)\s*/g,"$1 ");
  // Clean extra spaces
  s = s.replace(/  +/g," ").trim();
  return s;
}

/* ─────────────────────────────────────────────
   FIGURE / DIAGRAM RENDERER
   Shows actual PDF page images instead of re-drawn SVGs.
   Falls back to SVG only for legacy [FIGURE: description] format.
───────────────────────────────────────────── */

/* ══════════════════════════════════════════
   REAL PAGE IMAGE — fetches actual PDF page
   pdfBase64 is stored in window.__pdfBase64 after upload
══════════════════════════════════════════ */
function PageImageFigure({ pageNumber, compact, label }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pageNumber) { setLoading(false); setError(true); return; }
    const pdfBase64 = window.__pdfBase64;
    if (!pdfBase64) { setLoading(false); setError(true); return; }

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch("/api/page-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: pdfBase64, page: pageNumber }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.ok && data.image) setImgSrc(`data:image/png;base64,${data.image}`);
        else setError(true);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });

    return () => { cancelled = true; };
  }, [pageNumber]);

  const w = compact ? 260 : 380;
  const containerStyle = {
    border: "1.5px solid #1a237e",
    borderRadius: compact ? 6 : 8,
    overflow: "hidden",
    background: "white",
    display: "inline-block",
    maxWidth: "100%",
    verticalAlign: "top",
  };
  const headerStyle = {
    background: "#1a237e",
    color: "white",
    padding: compact ? "3px 8px" : "5px 12px",
    fontSize: compact ? 9 : 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>🖼️</span> {label || "FIGURE"} {pageNumber ? `(p.${pageNumber})` : ""}
      </div>
      <div style={{ padding: compact ? "4px 6px" : "8px 12px", textAlign: "center", minHeight: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loading && (
          <div style={{ color: "#666", fontSize: compact ? 10 : 12 }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Loading diagram...
          </div>
        )}
        {!loading && error && (
          <div style={{ color: "#999", fontSize: compact ? 9 : 11, fontStyle: "italic" }}>
            [Figure on page {pageNumber}]
          </div>
        )}
        {!loading && imgSrc && (
          <img
            src={imgSrc}
            alt={`Figure from page ${pageNumber}`}
            style={{ maxWidth: w, width: "100%", height: "auto", display: "block" }}
          />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   GRAPH SVG — legacy fallback for old [FIGURE: description] format
══════════════════════════════════════════ */
function GraphSVG({ desc, compact }) {
  const d = desc.toLowerCase();
  const W = compact ? 170 : 260;
  const H = compact ? 130 : 190;
  const ox = compact ? 28 : 38;
  const oy = H - (compact ? 22 : 28);
  const gw = W - ox - (compact ? 10 : 16);
  const gh = oy - (compact ? 14 : 18);
  const lw = compact ? 1.8 : 2.2;
  const fs = compact ? 9 : 12;

  const xLabel = d.includes("time") || d.match(/\bt\b/) ? "t" :
                 d.includes("displacement") || d.match(/\bx\b/) ? "x" : "t";
  const yLabel = d.includes("acceleration") || d.includes("a-t") ? "a" :
                 d.includes("velocity") || d.includes("v-t") ? "v" :
                 d.includes("force") || d.includes("f-t") ? "F" :
                 d.includes("current") ? "I" :
                 d.includes("pressure") ? "P" :
                 d.includes("displacement") ? "s" : "y";

  const px = f => ox + f * gw;
  const py = f => oy - f * gh;

  // ── Feature detection ──
  const hasZeroRegion =
    d.includes("zero from") || d.includes("zero until") || d.includes("zero for") ||
    d.includes("remains at 0") || d.includes("remains 0") || d.includes("stays at zero") ||
    d.includes("a=0") || d.includes("at zero for") || d.includes("remains a=0") ||
    d.includes("zero upto") || d.includes("zero up to") || d.includes("zero region") ||
    d.includes("zero to t") || d.includes("zero till");

  const hasCurve =
    d.includes("parabola") || d.includes("concave") || d.includes("curves upward") ||
    d.includes("curve up") || d.includes("curving") || d.includes("sweeping") ||
    (d.includes("curve") && !d.includes("curved line"));

  const hasLinear =
    d.includes("increases linearly") || d.includes("linear increase") ||
    d.includes("linearly") || d.includes("straight line") || d.includes("diagonal") ||
    d.includes("linear from") || d.includes("increases linear");

  const hasConstant =
    (d.includes("constant") || d.includes("horizontal") || d.includes("flat") || d.includes("plateau"))
    && !d.includes("not constant");

  const hasJump =
    d.includes("jump") || d.includes("abrupt") || d.includes("sudden") ||
    d.includes("steps up") || d.includes("instantly") || d.includes("discontinuity");

  const hasDrop =
    d.includes("drop") || d.includes("falls to zero") || d.includes("goes to zero") ||
    d.includes("back to zero") || d.includes("decreases to zero") || d.includes("falls back");

  const hasLinearThenConstant =
    (d.includes("then constant") || d.includes("then flat") || d.includes("then horizontal") ||
     d.includes("constant after") || d.includes("flat after") || d.includes("levels off") ||
     d.includes("becomes constant") || d.includes("then plateau"));

  const hasConstantThenLinear =
    (d.includes("constant then") || d.includes("flat then") || d.includes("plateau then") ||
     d.includes("then linear") || d.includes("then increases linearly") ||
     d.includes("then increases linear"));

  const zeroEnd = hasZeroRegion ? 0.32 : 0;
  const jumpH   = 0.55;
  const flatH   = 0.30; // height after jump for constant-then-linear (like graph C in original)

  let lines  = [];
  let curves = [];

  // ── Priority-ordered shape matching ──

  if (hasZeroRegion && hasCurve && !hasJump) {
    // Graph A: zero flat → then parabola/curve sweeping up from axis
    lines.push({ x1:px(0), y1:py(0), x2:px(zeroEnd), y2:py(0) });
    curves.push(`M ${px(zeroEnd)} ${py(0)} C ${px(zeroEnd+0.15)} ${py(0.02)}, ${px(0.78)} ${py(0.52)}, ${px(1.0)} ${py(0.95)}`);

  } else if (hasZeroRegion && hasJump && hasLinear && !hasConstant && !hasDrop) {
    // Graph B: zero → jump to small positive value → increases linearly
    lines.push({ x1:px(0),      y1:py(0),      x2:px(zeroEnd),  y2:py(0) });        // flat zero
    lines.push({ x1:px(zeroEnd),y1:py(0),      x2:px(zeroEnd),  y2:py(flatH) });    // vertical jump
    lines.push({ x1:px(zeroEnd),y1:py(flatH),  x2:px(1.0),      y2:py(0.92) });     // linear up

  } else if (hasZeroRegion && hasConstantThenLinear) {
    // Graph C: zero → constant flat → then linear increase (with or without explicit jump)
    lines.push({ x1:px(0),       y1:py(0),     x2:px(zeroEnd),   y2:py(0) });       // zero region
    lines.push({ x1:px(zeroEnd), y1:py(0),     x2:px(zeroEnd),   y2:py(flatH) });   // jump up
    lines.push({ x1:px(zeroEnd), y1:py(flatH), x2:px(0.60),      y2:py(flatH) });   // flat constant
    lines.push({ x1:px(0.60),    y1:py(flatH), x2:px(1.0),       y2:py(0.92) });    // linear up

  } else if (hasZeroRegion && hasJump && hasConstant && !hasLinear && !hasDrop) {
    // Graph D: zero → jump → constant flat plateau (stays high)
    lines.push({ x1:px(0),       y1:py(0),     x2:px(zeroEnd),   y2:py(0) });
    lines.push({ x1:px(zeroEnd), y1:py(0),     x2:px(zeroEnd),   y2:py(jumpH) });
    lines.push({ x1:px(zeroEnd), y1:py(jumpH), x2:px(1.0),       y2:py(jumpH) });

  } else if (hasZeroRegion && hasJump && hasConstant && hasDrop) {
    // zero → jump → plateau → drop back to zero
    lines.push({ x1:px(0),    y1:py(0),      x2:px(0.28),  y2:py(0) });
    lines.push({ x1:px(0.28), y1:py(0),      x2:px(0.28),  y2:py(jumpH) });
    lines.push({ x1:px(0.28), y1:py(jumpH),  x2:px(0.68),  y2:py(jumpH) });
    lines.push({ x1:px(0.68), y1:py(jumpH),  x2:px(0.68),  y2:py(0) });
    lines.push({ x1:px(0.68), y1:py(0),      x2:px(1.0),   y2:py(0) });

  } else if (hasZeroRegion && hasLinearThenConstant) {
    // zero → linear → constant (levels off)
    lines.push({ x1:px(0),      y1:py(0),     x2:px(zeroEnd), y2:py(0) });
    lines.push({ x1:px(zeroEnd),y1:py(0),     x2:px(0.60),    y2:py(jumpH) });
    lines.push({ x1:px(0.60),   y1:py(jumpH), x2:px(1.0),     y2:py(jumpH) });

  } else if (hasZeroRegion && hasLinear) {
    // zero → linear (no jump, smooth start)
    lines.push({ x1:px(0),      y1:py(0),  x2:px(zeroEnd), y2:py(0) });
    lines.push({ x1:px(zeroEnd),y1:py(0),  x2:px(1.0),     y2:py(0.92) });

  } else if (hasLinearThenConstant) {
    // linear then levels off
    lines.push({ x1:px(0),    y1:py(0),     x2:px(0.55), y2:py(jumpH) });
    lines.push({ x1:px(0.55), y1:py(jumpH), x2:px(1.0),  y2:py(jumpH) });

  } else if (hasConstantThenLinear) {
    // flat then linear
    lines.push({ x1:px(0),    y1:py(flatH), x2:px(0.45), y2:py(flatH) });
    lines.push({ x1:px(0.45), y1:py(flatH), x2:px(1.0),  y2:py(0.92) });

  } else if (hasLinear) {
    // pure linear from origin
    lines.push({ x1:px(0), y1:py(0), x2:px(1.0), y2:py(0.92) });

  } else if (hasConstant && !hasLinear) {
    // flat horizontal
    lines.push({ x1:px(0), y1:py(jumpH), x2:px(1.0), y2:py(jumpH) });

  } else if (hasCurve) {
    // parabola from origin
    curves.push(`M ${px(0)} ${py(0)} C ${px(0.3)} ${py(0.02)}, ${px(0.7)} ${py(0.5)}, ${px(1.0)} ${py(0.95)}`);

  } else {
    // default: linear from origin
    lines.push({ x1:px(0), y1:py(0), x2:px(1.0), y2:py(0.85) });
  }

  return (
    <svg width={W} height={H} style={{ display:"block" }}>
      {[0.25,0.5,0.75].map(f=>(
        <line key={"gx"+f} x1={px(f)} y1={14} x2={px(f)} y2={oy} stroke="#e8e8e8" strokeWidth={0.5} strokeDasharray="3,3"/>
      ))}
      {[0.33,0.66].map(f=>(
        <line key={"gy"+f} x1={ox} y1={py(f)} x2={W-6} y2={py(f)} stroke="#e8e8e8" strokeWidth={0.5} strokeDasharray="3,3"/>
      ))}
      <line x1={ox} y1={oy} x2={ox} y2={10} stroke="#222" strokeWidth={1.5}/>
      <polygon points={`${ox},10 ${ox-3.5},18 ${ox+3.5},18`} fill="#222"/>
      <line x1={ox} y1={oy} x2={W-5} y2={oy} stroke="#222" strokeWidth={1.5}/>
      <polygon points={`${W-5},${oy} ${W-13},${oy-3.5} ${W-13},${oy+3.5}`} fill="#222"/>
      <text x={ox-8} y={oy+fs+2} fontSize={fs} fill="#444" fontFamily="serif">O</text>
      <text x={W-8} y={oy+fs+2} fontSize={fs} fill="#333" fontFamily="serif" fontStyle="italic">{xLabel}</text>
      <text x={4} y={16} fontSize={fs} fill="#333" fontFamily="serif" fontStyle="italic">{yLabel}</text>
      {lines.map((l,i)=>(
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#1a237e" strokeWidth={lw} strokeLinecap="round" strokeLinejoin="round"/>
      ))}
      {curves.map((c,i)=>(
        <path key={"c"+i} d={c} stroke="#1a237e" strokeWidth={lw} fill="none" strokeLinecap="round"/>
      ))}
    </svg>
  );
}

/* ══════════════════════════════════════════
   PHYSICS DIAGRAM SVG — blocks, pulleys, strings, etc.
══════════════════════════════════════════ */
function PhysicsDiagramSVG({ desc, compact }) {
  const d = desc.toLowerCase();
  const W = compact ? 200 : 300;
  const H = compact ? 140 : 190;
  const fs = compact ? 9 : 11;
  const fsb = compact ? 8 : 10;

  // Helper: parse all masses from description, returns array of numbers
  function parseMasses() {
    return [...d.matchAll(/(\d+\.?\d*)\s*kg/g)].map(m => parseFloat(m[1]));
  }

  // ── Pulley / Atwood machine ──
  // Triggered by "pulley" OR "inextensible string" over "smooth" (Atwood)
  const isPulley = d.includes("pulley") || 
    (d.includes("inextensible") && (d.includes("smooth") || d.includes("massless")));

  if (isPulley) {
    const masses = parseMasses();
    const m1 = masses[0] || 0.25;
    const m2 = masses[1] || 0.80;
    const m1label = masses[0] != null ? `${m1} kg` : "m₁";
    const m2label = masses[1] != null ? `${m2} kg` : "m₂";

    // Heavier block hangs lower — proportional to mass difference
    const total = m1 + m2;
    const cx = W / 2;
    const pr = compact ? 14 : 20; // pulley radius
    const pulleyY = pr + 10;
    const ropeStartY = pulleyY + pr;

    // Block sizes proportional to mass
    const baseW = compact ? 26 : 36;
    const baseH = compact ? 18 : 24;
    const bW1 = baseW + (m1 / total) * (compact ? 16 : 22);
    const bH1 = baseH + (m1 / total) * (compact ? 10 : 14);
    const bW2 = baseW + (m2 / total) * (compact ? 16 : 22);
    const bH2 = baseH + (m2 / total) * (compact ? 10 : 14);

    // Heavier = lower. Range: 55%–85% of H
    const maxRope = H - Math.max(bH1, bH2) - 8;
    const minRope = ropeStartY + 18;
    const ropeRange = maxRope - minRope;

    // m1 left, m2 right
    const rope1Len = minRope + (m2 / total) * ropeRange; // heavier m2 → m1 goes up → m1 rope shorter
    const rope2Len = minRope + (m1 / total) * ropeRange; // lighter m1 → m2 goes down → m2 rope longer

    const b1TopY = rope1Len;
    const b2TopY = rope2Len;

    return (
      <svg width={W} height={H} style={{display:"block"}}>
        {/* ceiling */}
        <line x1={0} y1={6} x2={W} y2={6} stroke="#555" strokeWidth={2}/>
        <rect x={cx - pr - 4} y={2} width={(pr + 4) * 2} height={8} fill="#666"/>
        {/* pulley wheel */}
        <circle cx={cx} cy={pulleyY} r={pr} fill="white" stroke="#444" strokeWidth={compact ? 1.5 : 2}/>
        <circle cx={cx} cy={pulleyY} r={pr * 0.28} fill="#aaa" stroke="#555" strokeWidth={1}/>
        {/* ropes */}
        <line x1={cx - pr} y1={pulleyY} x2={cx - pr} y2={b1TopY} stroke="#555" strokeWidth={compact ? 1.5 : 2}/>
        <line x1={cx + pr} y1={pulleyY} x2={cx + pr} y2={b2TopY} stroke="#555" strokeWidth={compact ? 1.5 : 2}/>
        {/* block 1 (left, lighter if m1<m2) */}
        <rect x={cx - pr - bW1 / 2} y={b1TopY} width={bW1} height={bH1}
          fill="#90caf9" stroke="#1565c0" strokeWidth={compact ? 1.5 : 2} rx={3}/>
        <text x={cx - pr} y={b1TopY + bH1 / 2 + fsb * 0.4} textAnchor="middle"
          fontSize={fsb} fontWeight="700" fill="#0d47a1" fontFamily="sans-serif">{m1label}</text>
        {/* block 2 (right, heavier if m2>m1) */}
        <rect x={cx + pr - bW2 / 2} y={b2TopY} width={bW2} height={bH2}
          fill="#a5d6a7" stroke="#2e7d32" strokeWidth={compact ? 1.5 : 2} rx={3}/>
        <text x={cx + pr} y={b2TopY + bH2 / 2 + fsb * 0.4} textAnchor="middle"
          fontSize={fsb} fontWeight="700" fill="#1b5e20" fontFamily="sans-serif">{m2label}</text>
      </svg>
    );
  }

  // ── Horizontal blocks with forces ──
  if (d.includes("block") || d.includes("surface")) {
    const masses = parseMasses();
    const m1 = masses[0] || 1, m2 = masses[1] || 1;
    const m1label = masses[0] != null ? `${m1} kg` : "m₁";
    const m2label = masses[1] != null ? `${m2} kg` : "m₂";

    const f1match = d.match(/f1\s*=\s*(\d+)|(\d+)\s*n.*?(?:left|push)/);
    const f2match = d.match(/f2\s*=\s*(\d+)|(\d+)\s*n.*?(?:right)/);
    // Also try plain "XN pushes" or "force FX=YN"
    const forceNums = [...d.matchAll(/(\d+)\s*n/g)].map(m => m[1]);
    const f1val = d.match(/f1\s*=\s*(\d+)/)?.[1] || forceNums[0] || "F₁";
    const f2val = d.match(/f2\s*=\s*(\d+)/)?.[1] || forceNums[1] || "F₂";

    const groundY = H - (compact ? 22 : 30);
    const blockH2 = compact ? 30 : 40;

    // Block WIDTH proportional to mass
    const totalMass = m1 + m2;
    const minBW = compact ? 32 : 44;
    const maxBW = compact ? 62 : 82;
    const blockW1 = minBW + (m1 / totalMass) * (maxBW - minBW);
    const blockW2 = minBW + (m2 / totalMass) * (maxBW - minBW);

    const gap = compact ? 4 : 6;
    const totalW = blockW1 + gap + blockW2;
    const startX = (W - totalW) / 2;
    const b1x = startX, b2x = startX + blockW1 + gap;
    const by = groundY - blockH2;
    const arrowLen = compact ? 30 : 42;

    return (
      <svg width={W} height={H} style={{display:"block"}}>
        {/* ground */}
        <line x1={0} y1={groundY} x2={W} y2={groundY} stroke="#555" strokeWidth={1.5}/>
        {[...Array(8)].map((_,i)=>(
          <line key={i} x1={i*(W/7)} y1={groundY} x2={i*(W/7)-(compact?5:7)} y2={groundY+(compact?5:7)} stroke="#bbb" strokeWidth={1}/>
        ))}
        {/* block 1 */}
        <rect x={b1x} y={by} width={blockW1} height={blockH2} fill="#90caf9" stroke="#1565c0" strokeWidth={compact?1.5:2} rx={3}/>
        <text x={b1x+blockW1/2} y={by+blockH2/2+fsb*0.4} textAnchor="middle" fontSize={fsb} fontWeight="700" fill="#0d47a1" fontFamily="sans-serif">{m1label}</text>
        {/* block 2 */}
        <rect x={b2x} y={by} width={blockW2} height={blockH2} fill="#a5d6a7" stroke="#2e7d32" strokeWidth={compact?1.5:2} rx={3}/>
        <text x={b2x+blockW2/2} y={by+blockH2/2+fsb*0.4} textAnchor="middle" fontSize={fsb} fontWeight="700" fill="#1b5e20" fontFamily="sans-serif">{m2label}</text>
        {/* F1 arrow from left */}
        <line x1={b1x-arrowLen} y1={by+blockH2/2} x2={b1x-2} y2={by+blockH2/2} stroke="#e53935" strokeWidth={compact?2:2.5}/>
        <polygon points={`${b1x-2},${by+blockH2/2} ${b1x-10},${by+blockH2/2-4} ${b1x-10},${by+blockH2/2+4}`} fill="#e53935"/>
        <text x={b1x-arrowLen/2} y={by+blockH2/2-6} textAnchor="middle" fontSize={fsb} fill="#c62828" fontWeight="700" fontFamily="sans-serif">{f1val}N</text>
        {/* F2 arrow from right */}
        <line x1={b2x+blockW2+2} y1={by+blockH2/2} x2={b2x+blockW2+arrowLen} y2={by+blockH2/2} stroke="#e53935" strokeWidth={compact?2:2.5}/>
        <polygon points={`${b2x+blockW2+arrowLen},${by+blockH2/2} ${b2x+blockW2+arrowLen-8},${by+blockH2/2-4} ${b2x+blockW2+arrowLen-8},${by+blockH2/2+4}`} fill="#e53935"/>
        <text x={b2x+blockW2+arrowLen/2+2} y={by+blockH2/2-6} textAnchor="middle" fontSize={fsb} fill="#c62828" fontWeight="700" fontFamily="sans-serif">{f2val}N</text>
      </svg>
    );
  }

  // ── String / two masses on surface ──
  if (d.includes("string") && d.includes("mass")) {
    const masses = parseMasses();
    const m1 = masses[0] || 1, m2 = masses[1] || 1;
    const total = m1 + m2;
    const groundY = H-(compact?22:30);
    const blockH2=compact?26:34;
    const minBW = compact ? 30 : 40, maxBW = compact ? 54 : 72;
    const bW1 = minBW + (m1/total)*(maxBW-minBW);
    const bW2 = minBW + (m2/total)*(maxBW-minBW);
    const cx1=W*0.28, cx2=W*0.72;
    const by=groundY-blockH2;
    return (
      <svg width={W} height={H} style={{display:"block"}}>
        <line x1={0} y1={groundY} x2={W} y2={groundY} stroke="#555" strokeWidth={1.5}/>
        {[...Array(8)].map((_,i)=>(
          <line key={i} x1={i*(W/7)} y1={groundY} x2={i*(W/7)-5} y2={groundY+5} stroke="#bbb" strokeWidth={1}/>
        ))}
        <rect x={cx1-bW1/2} y={by} width={bW1} height={blockH2} fill="#90caf9" stroke="#1565c0" strokeWidth={compact?1.5:2} rx={3}/>
        <text x={cx1} y={by+blockH2/2+fsb*0.4} textAnchor="middle" fontSize={fsb} fontWeight="700" fill="#0d47a1" fontFamily="sans-serif">{m1} kg</text>
        <line x1={cx1+bW1/2} y1={by+blockH2/2} x2={cx2-bW2/2} y2={by+blockH2/2} stroke="#555" strokeWidth={compact?1.5:2}/>
        <rect x={cx2-bW2/2} y={by} width={bW2} height={blockH2} fill="#a5d6a7" stroke="#2e7d32" strokeWidth={compact?1.5:2} rx={3}/>
        <text x={cx2} y={by+blockH2/2+fsb*0.4} textAnchor="middle" fontSize={fsb} fontWeight="700" fill="#1b5e20" fontFamily="sans-serif">{m2} kg</text>
        <text x={W/2} y={by-4} textAnchor="middle" fontSize={fsb} fill="#555" fontFamily="sans-serif">string</text>
      </svg>
    );
  }

  // ── Fallback ──
  const cx = W/2, cy = H/2;
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      <text x={cx} y={cy} textAnchor="middle" fontSize={fs} fill="#444" fontFamily="sans-serif">
        [Physics Diagram]
      </text>
      <text x={cx} y={cy+fs+4} textAnchor="middle" fontSize={fs-1} fill="#888" fontFamily="sans-serif" fontStyle="italic">
        {desc.slice(0,60)}{desc.length>60?"...":""}
      </text>
    </svg>
  );
}

/* ══════════════════════════════════════════
   Detect what kind of diagram to render
══════════════════════════════════════════ */
function getDiagramType(desc) {
  const d = desc.toLowerCase();
  const isPhysics = d.includes("block") || d.includes("pulley") || d.includes("surface") ||
    d.includes("inextensible") || d.includes("smooth pulley") || d.includes("massless pulley") ||
    d.includes("string") || d.includes("force") || d.includes("mass") || d.includes("atwood");
  const isGraph = !isPhysics && (d.includes("graph") || d.includes("a-t") || d.includes("v-t") ||
    d.includes("acceleration") || d.includes("velocity") ||
    d.includes("increases linearly") || d.includes("parabola") ||
    d.includes("concave") || (d.includes("constant") && d.includes("linear")) ||
    d.includes("straight line") || d.includes("axis"));
  if (isPhysics) return "physics";
  if (isGraph) return "graph";
  if (isPhysics) return "physics";
  return "text";
}

function FigureBox({ desc, compact }) {
  const type = getDiagramType(desc);
  return (
    <div style={{
      border: `1.5px solid #1a237e`,
      borderRadius: compact ? 6 : 8,
      overflow: "hidden",
      background: "white",
      display: "inline-block",
      maxWidth: "100%",
    }}>
      <div style={{
        background: "#1a237e",
        color: "white",
        padding: compact ? "3px 8px" : "5px 12px",
        fontSize: compact ? 9 : 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span>📊</span> FIGURE / DIAGRAM
      </div>
      <div style={{ padding: compact ? "4px 6px" : "8px 12px", textAlign: "center" }}>
        {type === "graph" && <GraphSVG desc={desc} compact={compact} />}
        {type === "physics" && <PhysicsDiagramSVG desc={desc} compact={compact} />}
        {type === "text" && (
          <div style={{
            fontSize: compact ? 11 : 13,
            color: "#222",
            lineHeight: 1.7,
            fontFamily: "Georgia, serif",
            textAlign: "left",
            borderLeft: "3px solid #1a237e",
            paddingLeft: 10,
            padding: compact ? "4px 8px" : "8px 12px",
            maxWidth: compact ? 220 : 400,
          }}>
            {renderMath(desc)}
          </div>
        )}
      </div>
    </div>
  );
}

// New: render question text supporting both [FIGURE] (new) and [FIGURE: desc] (legacy)
function renderQuestionText(text, compact, figurePageNumber) {
  if (!text) return null;
  // Split on both new [FIGURE] / [FIGURE_X] and legacy [FIGURE: description]
  const parts = text.split(/(\[FIGURE(?:_[ABCD])?\]|\[FIGURE:[^\]]+\])/gi);
  return parts.map((part, i) => {
    // New format: [FIGURE] — show real PDF page image
    if (/^\[FIGURE\]$/i.test(part)) {
      return <PageImageFigure key={i} pageNumber={figurePageNumber} compact={compact} label="FIGURE" />;
    }
    // New format: [FIGURE_A] etc (option is a diagram — show inline)
    const optMatch = part.match(/^\[FIGURE_([ABCD])\]$/i);
    if (optMatch) {
      return <PageImageFigure key={i} pageNumber={figurePageNumber} compact={compact} label={`Graph ${optMatch[1]}`} />;
    }
    // Legacy format: [FIGURE: description] — use old SVG renderer as fallback
    const legacyMatch = part.match(/^\[FIGURE:\s*(.*?)\s*\]$/is);
    if (legacyMatch) {
      const desc = legacyMatch[1].trim();
      return <FigureBox key={i} desc={desc} compact={compact} />;
    }
    const mathRendered = renderMath(part);
    if (!mathRendered) return null;
    return <span key={i}>{mathRendered}</span>;
  });
}


/* ─────────────────────────────────────────────
   DEMO QUESTIONS
───────────────────────────────────────────── */
const DEMO_QUESTIONS = [
  { id:1, subject:"Physics", type:"mcq", text:"Which of the following correctly gives the Planck length from constants G, hbar and c?", options:["Ghbar2c3","G2hbarc","sqrt(Ghbar/c3)","sqrt(Gc/hbar3)"], correct:2, marks:4, negative:-1 },
  { id:2, subject:"Physics", type:"mcq", text:"A ball is thrown vertically upward at 20 m/s from a 25 m building. Time to hit ground? (g=10)", options:["4 s","5 s","6 s","3 s"], correct:1, marks:4, negative:-1 },
  { id:3, subject:"Physics", type:"integer", text:"Two resistors 4 and 6 ohms are in parallel. Find equivalent resistance x 10.", options:[], correct:24, marks:4, negative:0 },
  { id:4, subject:"Chemistry", type:"mcq", text:"Electronic configuration of Cu (Z=29)?", options:["[Ar]3d9 4s2","[Ar]3d10 4s1","[Ar]3d8 4s2 4p1","[Ar]3d10 4s2"], correct:1, marks:4, negative:-1 },
  { id:5, subject:"Chemistry", type:"mcq", text:"IUPAC name of CH3-CH(OH)-COOH?", options:["2-hydroxypropanoic acid","3-hydroxypropanoic acid","2-hydroxybutanoic acid","Propionic acid"], correct:0, marks:4, negative:-1 },
  { id:6, subject:"Chemistry", type:"integer", text:"How many sigma bonds in benzene (C6H6)?", options:[], correct:12, marks:4, negative:0 },
  { id:7, subject:"Mathematics", type:"mcq", text:"If alpha, beta are roots of x^2 - 3x + 2 = 0, find alpha^2 + beta^2.", options:["5","7","9","13"], correct:0, marks:4, negative:-1 },
  { id:8, subject:"Mathematics", type:"mcq", text:"Value of integral from 0 to pi of sin(x) dx?", options:["0","1","2","pi"], correct:2, marks:4, negative:-1 },
  { id:9, subject:"Mathematics", type:"integer", text:"5 boys, 3 girls seated in a row so no two girls are adjacent. Number of ways?", options:[], correct:14400, marks:4, negative:0 },
];

/* ─────────────────────────────────────────────
   AI PDF PARSER  — calls OUR backend /api/parse-pdf
   The Gemini API key never touches the browser.
───────────────────────────────────────────── */
async function parsePDF(base64, isKey, model, attempt = 0) {
  // 150 second timeout — large JEE PDFs can take a while
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150_000);

  let res;
  try {
    res = await fetch("/api/parse-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, isKey, model }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out after 150s. Try a smaller PDF.");
    throw new Error("Network error — is the server running? " + err.message);
  }
  clearTimeout(timer);

  // If server returned non-JSON (e.g. Render is cold-starting or crashed),
  // retry once after a short delay before showing an error
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (attempt === 0) {
      // Server may be waking up — wait 5s and retry once
      await new Promise(r => setTimeout(r, 5000));
      return parsePDF(base64, isKey, model, 1);
    }
    throw new Error(
      `Server error (HTTP ${res.status}). ` +
      (res.status === 502 ? "The server may still be waking up — wait 30 seconds and try again." :
       res.status === 503 ? "Server timeout — your PDF may be too large." :
       "Check Render logs for details.")
    );
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server returned invalid response (status ${res.status}). Check Render logs.`);
  }

  if (!res.ok) {
    const msg = json.error || `Server error ${res.status}`;
    // Detect quota exhaustion and give helpful message
    if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
      throw new Error("❌ Gemini quota exceeded for all models. Your free API key limit (1500/day) is used up. Wait until tomorrow or get a new API key from Google AI Studio.");
    }
    throw new Error(msg);
  }

  return json.data; // { questions: [...] }  or  { answers: [...] }
}

/* ─────────────────────────────────────────────
   GOOGLE DRIVE HELPER
───────────────────────────────────────────── */
async function fetchDriveFile(fileId, apiKey) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Drive fetch failed: " + res.status);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ==============================================
   MAIN APP
============================================== */
export default function App() {
  const [page, setPage] = useState("login");
  const [user, setUser] = useState(null);
  const [tests, setTests] = useState([]);
  const [activeTest, setActiveTest] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [directTestId, setDirectTestId] = useState(null);
  const [directResult, setDirectResult] = useState(null);
  const [serverReady, setServerReady] = useState(true);

  // Health check at App level so ALL screens get the right value
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
        setServerReady(r.ok);
      } catch {
        setServerReady(false);
        setTimeout(check, 8000);
      }
    };
    check();
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await dbGet("tests");
      const loadedTests = saved || [];
      if (saved) setTests(loadedTests);

      const savedSession = sessionGet("session");
      if (savedSession?.user) {
        const { user: su, page: sp, activeTestId, submission: sub } = savedSession;
        setUser(su);
        if (sp === "test" && activeTestId) {
          const test = loadedTests.find(t => t.id === activeTestId);
          if (test) { setActiveTest(test); setPage("test"); return; }
        }
        if (sp === "results" && activeTestId && sub) {
          const test = loadedTests.find(t => t.id === activeTestId);
          if (test) { setActiveTest(test); setSubmission(sub); setPage("results"); return; }
        }
        setPage(su.role === ROLES.STUDENT ? "student" : "admin");
        return;
      }

      const testId = getUrlParam("testId");
      const resultId = getUrlParam("result");
      const resultStudent = getUrlParam("student");

      if (resultId && resultStudent) {
        const allResults = await dbGet("all-results") || {};
        const key = `${resultId}__${resultStudent}`;
        const storedResult = allResults[key];
        if (storedResult) {
          const test = loadedTests.find(t => t.id === resultId);
          if (test) {
            setDirectResult({ test, submission: storedResult, studentName: resultStudent });
            setPage("shared-result");
            return;
          }
        }
        setDirectResult({ error: "Result not found. The student may not have submitted yet." });
        setPage("shared-result");
        return;
      }

      if (testId) {
        setDirectTestId(testId);
        setPage("login");
      }
    })();
  }, []);

  const saveTests = async (t) => { setTests(t); await dbSet("tests", t); };

  useEffect(() => {
    if (user && page !== "login" && page !== "shared-result") {
      sessionSet("session", {
        user,
        page,
        activeTestId: activeTest?.id || null,
        submission: page === "results" ? submission : null,
      });
    }
  }, [user, page, activeTest, submission]);

  const doLogout = () => {
    sessionDel("session");
    setUser(null);
    setActiveTest(null);
    setSubmission(null);
    setPage("login");
  };

  const login = async (role, name) => {
    setUser({ role, name });
    if (role === ROLES.STUDENT && directTestId) {
      const saved = await dbGet("tests");
      const test = (saved || []).find(t => t.id === directTestId);
      if (test) {
        const allResults = await dbGet("all-results") || {};
        const key = `${test.id}__${name}`;
        if (allResults[key]) {
          setActiveTest(test);
          setSubmission(allResults[key]);
          setPage("results");
          return;
        }
        setActiveTest(test);
        setPage("test");
        return;
      }
    }
    setPage(role === ROLES.STUDENT ? "student" : "admin");
  };

  const handleSubmit = async (sub) => {
    setSubmission(sub);
    const allResults = await dbGet("all-results") || {};
    const key = `${activeTest.id}__${user.name}`;
    if (!allResults[key]) {
      allResults[key] = sub;
      await dbSet("all-results", allResults);
    }
    setPage("results");
  };

  if (page === "shared-result") return <SharedResultScreen data={directResult} />;
  if (page === "login") return <LoginScreen onLogin={login} tests={tests} directTestId={directTestId} />;
  if (page === "admin") return <AdminScreen user={user} tests={tests} onSaveTests={saveTests} onLogout={doLogout} serverReady={serverReady} />;
  if (page === "student") return (
    <StudentScreen user={user} tests={tests}
      onStart={(test) => { setActiveTest(test); setPage("instructions"); }}
      onViewResult={(test, sub) => { setActiveTest(test); setSubmission(sub); setPage("results"); }}
      onLogout={doLogout} serverReady={serverReady} />
  );
  if (page === "instructions") return (
    <InstructionsScreen test={activeTest} student={user}
      onProceed={() => setPage("test")}
      onBack={() => setPage("student")} />
  );
  if (page === "test") return (
    <TestScreen test={activeTest} student={user} onSubmit={handleSubmit} />
  );
  if (page === "results") return (
    <ResultsScreen test={activeTest} student={user} submission={submission}
      onBack={() => setPage("student")} />
  );
}

/* ─────────────────────────────────────────────
   LOGIN SCREEN
───────────────────────────────────────────── */
function LoginScreen({ onLogin, tests, directTestId }) {
  const [tab, setTab] = useState("student");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const linkedTest = directTestId ? tests.find(t => t.id === directTestId) : null;

  const handle = async () => {
    if (!name.trim()) { setErr("Enter your username"); return; }
    if (!pass.trim()) { setErr("Enter your password"); return; }
    setLoading(true); setErr("");

    if (tab === "student") {
      const studentPasswords = await dbGet("student-passwords") || [];
      if (studentPasswords.length === 0) {
        setErr("No student accounts exist yet. Ask your admin to create your account.");
        setLoading(false);
        return;
      }
      const match = studentPasswords.find(
        sp => sp.username.trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (!match) {
        setErr("Username not found. Contact your admin.");
        setLoading(false);
        return;
      }
      if (match.password !== pass) {
        setErr("Wrong password. Please try again.");
        setLoading(false);
        return;
      }
      onLogin(tab, match.name);
    } else {
      if (pass !== "admin123") {
        setErr("Wrong password.");
        setLoading(false);
        return;
      }
      onLogin(tab, name.trim());
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0e1a", display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"Georgia, serif", backgroundImage:"radial-gradient(ellipse at 20% 50%, #0d1b3e 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #1a0d2e 0%, transparent 60%)" }}>
      <div style={{ width:"100%", maxWidth:420, padding:20 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🎯</div>
          <div style={{ color:"#e8c97e", fontSize:26, fontWeight:700, letterSpacing:2 }}>TestForge</div>
          <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:4, fontFamily:"monospace", letterSpacing:1 }}>JEE EXAM PLATFORM</div>
        </div>

        {linkedTest && (
          <div style={{ background:"rgba(232,201,126,0.12)", border:"1px solid rgba(232,201,126,0.4)", borderRadius:14, padding:"14px 18px", marginBottom:18, textAlign:"center" }}>
            <div style={{ color:"#e8c97e", fontWeight:700, fontSize:14 }}>📋 You are joining a test</div>
            <div style={{ color:"white", fontWeight:800, fontSize:16, marginTop:4 }}>{linkedTest.title}</div>
            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:12, marginTop:4 }}>{linkedTest.durationMins} min — {linkedTest.questions?.length || 0} Questions</div>
          </div>
        )}

        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(232,201,126,0.2)", borderRadius:20, padding:"32px 28px", backdropFilter:"blur(12px)" }}>
          <div style={{ display:"flex", gap:4, marginBottom:28, background:"rgba(0,0,0,0.3)", borderRadius:10, padding:4 }}>
            {[["student","Student"],["teacher","Teacher"],["admin","Admin"]].map(([r,label]) => (
              <button key={r} onClick={() => { setTab(r); setErr(""); }}
                style={{ flex:1, padding:"9px 4px", borderRadius:8, border:"none", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                  background: tab===r ? "linear-gradient(135deg,#e8c97e,#c9a227)" : "transparent",
                  color: tab===r ? "#0a0e1a" : "rgba(255,255,255,0.5)" }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ color:"rgba(255,255,255,0.5)", fontSize:11, letterSpacing:2, textTransform:"uppercase", display:"block", marginBottom:7 }}>Full Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}
                placeholder="Your name"
                style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid rgba(232,201,126,0.25)", background:"rgba(255,255,255,0.05)", color:"white", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>
            <div>
              <label style={{ color:"rgba(255,255,255,0.5)", fontSize:11, letterSpacing:2, textTransform:"uppercase", display:"block", marginBottom:7 }}>Password</label>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}
                placeholder={tab === "student" ? "Enter your password" : "Enter admin password"}
                style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid rgba(232,201,126,0.25)", background:"rgba(255,255,255,0.05)", color:"white", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>
            {err && <div style={{ background:"rgba(229,57,53,0.15)", border:"1px solid #c62828", borderRadius:8, padding:"9px 13px", color:"#ef9a9a", fontSize:13 }}>{err}</div>}
            <button onClick={handle} disabled={loading}
              style={{ padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#e8c97e,#c9a227)", color:"#0a0e1a", fontSize:15, fontWeight:800, cursor:"pointer", fontFamily:"inherit", marginTop:4, letterSpacing:1, opacity:loading?0.7:1 }}>
              {loading ? "Verifying..." : "ENTER PORTAL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ADMIN SCREEN
───────────────────────────────────────────── */
function AdminScreen({ user, tests, onSaveTests, onLogout, serverReady }) {
  const [view, setView] = useState("dashboard");

  const [form, setForm] = useState({ title:"", subject:"", scheduledAt:"", durationMins:180, mode:"upload", driveApiKey:"", drivePaperFileId:"", driveKeyFileId:"" });
  const [paperFile, setPaperFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [studentPasswords, setStudentPasswords] = useState([]);
  const [newSP, setNewSP] = useState({ name:"", username:"", password:"" });
  const [spMsg, setSpMsg] = useState("");
  const [savedDriveKey, setSavedDriveKey] = useState("");
  const [savedModel, setSavedModel] = useState("gemini-2.0-flash");
  const paperRef = useRef(); const keyRef = useRef();

  // Section-based upload — each subject can have its own PDF
  const DEFAULT_SECTIONS = [
    { subject: "Physics",     file: null, mcq: 20, integer: 5, enabled: true },
    { subject: "Chemistry",   file: null, mcq: 20, integer: 5, enabled: true },
    { subject: "Mathematics", file: null, mcq: 20, integer: 5, enabled: true },
  ];
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [uploadMode, setUploadMode] = useState("combined"); // "combined" | "separate"
  const sectionRefs = useRef([null, null, null]);

  useEffect(() => {
    (async () => {
      const sp = await dbGet("student-passwords") || [];
      setStudentPasswords(sp);
      const driveKey = await dbGet("drive-api-key") || "";
      setSavedDriveKey(driveKey);
      setForm(f => ({ ...f, driveApiKey: driveKey }));
      const model = await dbGet("gemini-model") || "gemini-2.0-flash";
      setSavedModel(model);
    })();
  }, []);

  const saveStudentPasswords = async (list) => {
    setStudentPasswords(list);
    await dbSet("student-passwords", list);
  };

  const addStudent = async () => {
    if (!newSP.name.trim()) { setSpMsg("Enter student full name"); return; }
    if (!newSP.username.trim()) { setSpMsg("Enter a username"); return; }
    if (!newSP.password.trim()) { setSpMsg("Enter a password"); return; }
    const exists = studentPasswords.find(s => s.username && s.username.toLowerCase() === newSP.username.trim().toLowerCase());
    if (exists) { setSpMsg("Username already taken"); return; }
    const updated = [...studentPasswords, { name: newSP.name.trim(), username: newSP.username.trim(), password: newSP.password.trim() }];
    await saveStudentPasswords(updated);
    setNewSP({ name:"", username:"", password:"" });
    setSpMsg("✅ Student added!");
    setTimeout(() => setSpMsg(""), 2000);
  };

  const removeStudent = async (name) => {
    const updated = studentPasswords.filter(s => s.name !== name);
    await saveStudentPasswords(updated);
  };

  const updateStudentPassword = async (name, newPass) => {
    const updated = studentPasswords.map(s => s.name === name ? { ...s, password: newPass } : s);
    await saveStudentPasswords(updated);
  };

  const copyLink = (testId) => {
    const url = buildShareUrl(testId);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(testId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toBase64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(f); });

  const setMsg = (msg, type = "info") => { setStatus(msg); setStatusType(type); };

  const normalizeQs = (qs) => qs.map((q, idx) => {
    let type = q.type;
    if (!q.options || q.options.length === 0) type = "integer";
    if (q.options && q.options.length > 0) type = "mcq";
    return {
      ...q,
      id: q.id || (idx + 1),
      type,
      options: type === "mcq" ? (q.options || []) : [],
      marks: Number(q.marks) || 4,
      negative: q.negative !== undefined ? Number(q.negative) : (type === "mcq" ? -1 : 0),
    };
  });

  const createTest = async () => {
    if (!form.title.trim()) { setMsg("Enter a test title", "error"); return; }

    setLoading(true);
    setMsg("Starting...", "info");

    let questions = null;
    let geminiUsed = false;

    try {
      if (form.mode === "upload") {

        // ── SEPARATE SECTION MODE ──
        if (uploadMode === "separate") {
          const enabledSections = sections.filter(s => s.enabled);
          if (!enabledSections.some(s => s.file)) {
            setMsg("❌ Please upload at least one section PDF.", "error");
            setLoading(false); return;
          }
          const allQs = [];
          let globalId = 1;
          for (const sec of enabledSections) {
            if (!sec.file) { setMsg(`⚠️ ${sec.subject} PDF not uploaded — skipping`, "warning"); continue; }
            setMsg(`📄 Extracting ${sec.subject} questions... (${enabledSections.indexOf(sec)+1}/${enabledSections.length})`, "info");
            try {
              const b64 = await toBase64(sec.file);
              window.__pdfBase64 = b64; // Store for diagram image fetching
              const res = await parsePDF(b64, false, savedModel);
              if (res?.questions?.length) {
                const normalized = normalizeQs(res.questions).map(q => ({
                  ...q,
                  subject: sec.subject,
                  id: globalId++,
                }));
                allQs.push(...normalized);
                setMsg(`✅ ${sec.subject}: ${normalized.length} questions extracted`, "success");
              } else {
                setMsg(`⚠️ ${sec.subject}: No questions found in PDF`, "warning");
              }
            } catch (err) {
              setMsg(`❌ ${sec.subject} failed: ${err.message}`, "error");
              setLoading(false); return;
            }
          }
          if (allQs.length === 0) {
            setMsg("❌ No questions extracted from any section.", "error");
            setLoading(false); return;
          }
          questions = allQs;
          geminiUsed = true;
          setMsg(`✅ All sections done! Total: ${questions.length} questions`, "success");

        // ── COMBINED PDF MODE ──
        } else if (paperFile) {
          setMsg("📄 Converting PDF to base64...", "info");
          const b64 = await toBase64(paperFile);
          window.__pdfBase64 = b64; // Store for diagram image fetching
          setMsg("🤖 Extracting all subjects in parallel... Please wait up to 90s", "info");
          try {
            const res = await parsePDF(b64, false, savedModel);
            if (res?.questions?.length) {
              questions = normalizeQs(res.questions);
              geminiUsed = true;
              const warnMsg = res.warning ? ` ⚠️ Warning: ${res.warning}` : "";
              setMsg(`✅ Extracted ${questions.length} questions!${warnMsg}`, "success");
            } else {
              setMsg("❌ Gemini returned 0 questions. The PDF may be scanned/image-based or formatted unusually.", "error");
              setLoading(false); return;
            }
          } catch (geminiErr) {
            setMsg(`❌ Gemini failed: ${geminiErr.message}`, "error");
            setLoading(false); return;
          }
        } else {
          questions = DEMO_QUESTIONS;
          setMsg("No PDF uploaded — using demo questions.", "warning");
        }

        if (keyFile && geminiUsed) {
          setMsg("🤖 Parsing answer key with Gemini...", "info");
          try {
            const b64 = await toBase64(keyFile);
            const res = await parsePDF(b64, true, savedModel);
            if (res?.answers) {
              const map = {}; res.answers.forEach(a => map[a.q] = a.correct);
              questions = questions.map(q => ({ ...q, correct: map[q.id] ?? q.correct }));
              setMsg(`✅ Answer key applied to ${Object.keys(map).length} questions.`, "success");
            }
          } catch (keyErr) {
            setMsg(`⚠️ Answer key parse failed: ${keyErr.message}. Using answers extracted from paper.`, "warning");
          }
        }
      } else if (form.mode === "drive") {
        if (!form.driveApiKey || !form.drivePaperFileId) {
          setMsg("Enter Drive API key and Paper File ID", "error");
          setLoading(false);
          return;
        }
        setMsg("📁 Fetching from Google Drive...", "info");
        const paperB64 = await fetchDriveFile(form.drivePaperFileId, form.driveApiKey);
        window.__pdfBase64 = paperB64; // Store for diagram image fetching
        setMsg("🤖 Extracting questions in parallel (Physics + Chemistry + Maths)... Please wait up to 90s", "info");
        try {
          const parsed = await parsePDF(paperB64, false, savedModel);
          if (parsed?.questions?.length) {
            questions = parsed.questions.map((q, idx) => {
              let type = q.type;
              if (!q.options || q.options.length === 0) type = "integer";
              if (q.options && q.options.length > 0) type = "mcq";
              return {
                ...q,
                id: q.id || (idx + 1),
                type,
                options: type === "mcq" ? (q.options || []) : [],
                marks: Number(q.marks) || 4,
                negative: q.negative !== undefined ? Number(q.negative) : (type === "mcq" ? -1 : 0),
              };
            });
            geminiUsed = true;
          } else {
            setMsg("❌ Gemini returned 0 questions. The PDF may be scanned/image-based or formatted unusually. Check Render logs.", "error");
            setLoading(false);
            return;
          }
        } catch (err) {
          setMsg(`❌ Gemini failed: ${err.message}`, "error");
          setLoading(false);
          return;
        }
        if (form.driveKeyFileId && geminiUsed) {
          try {
            const keyB64 = await fetchDriveFile(form.driveKeyFileId, form.driveApiKey);
            const keyRes = await parsePDF(keyB64, true, savedModel);
            if (keyRes?.answers) {
              const map = {}; keyRes.answers.forEach(a => map[a.q] = a.correct);
              questions = questions.map(q => ({ ...q, correct: map[q.id] ?? q.correct }));
            }
          } catch {}
        }
      } else {
        // demo mode
        questions = DEMO_QUESTIONS;
      }
    } catch (e) {
      setMsg("Unexpected error: " + e.message, "error");
      setLoading(false);
      return;
    }

    const test = {
      id: Date.now().toString(),
      title: form.title,
      subject: form.subject || "Mixed",
      scheduledAt: !form.scheduledAt ? null : form.scheduledAt,
      durationMins: Number(form.durationMins) || 180,
      questions,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    };
    const updated = [test, ...tests];
    await onSaveTests(updated);
    setMsg(geminiUsed ? `✅ Test created with ${questions.length} AI-extracted questions!` : "✅ Test created with demo questions.", "success");
    setLoading(false);
    setTimeout(() => setView("dashboard"), 1500);
    setForm({ title:"", subject:"", scheduledAt:"", durationMins:180, mode:"upload", driveApiKey: savedDriveKey, drivePaperFileId:"", driveKeyFileId:"" });
    setPaperFile(null); setKeyFile(null);
  };

  const deleteTest = async (id) => {
    const updated = tests.filter(t=>t.id!==id);
    await onSaveTests(updated);
  };

  const statusColors = {
    [TEST_STATUS.SCHEDULED]:{bg:"#fff3e0",col:"#e65100",dot:"#ff9800"},
    [TEST_STATUS.LIVE]:{bg:"#e8f5e9",col:"#2e7d32",dot:"#43a047"},
    [TEST_STATUS.ENDED]:{bg:"#f5f5f5",col:"#616161",dot:"#9e9e9e"}
  };

  const statusBannerStyle = {
    info:    { background:"#e3f2fd", color:"#1565c0", border:"1px solid #90caf9" },
    success: { background:"#e8f5e9", color:"#2e7d32", border:"1px solid #a5d6a7" },
    warning: { background:"#fff8e1", color:"#e65100", border:"1px solid #ffe082" },
    error:   { background:"#ffebee", color:"#c62828", border:"1px solid #ef9a9a" },
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fb", fontFamily:"Georgia, serif" }}>
      {/* Server cold-start warning banner */}
      {!serverReady && (
        <div style={{ background:"#ff6f00", color:"white", padding:"10px 20px", textAlign:"center", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>⏳</span>
          Server is waking up (free tier cold start) — please wait 30–60 seconds, then try again.
          <button onClick={()=>window.location.reload()} style={{ marginLeft:12, padding:"4px 12px", borderRadius:6, border:"none", background:"white", color:"#ff6f00", fontWeight:800, cursor:"pointer", fontSize:12 }}>
            Refresh
          </button>
        </div>
      )}
      <div style={{ background:"linear-gradient(135deg,#1a1a2e,#16213e)", color:"white", padding:"0 24px", height:58, display:"flex", alignItems:"center", gap:16 }}>
        <span style={{ color:"#e8c97e", fontWeight:800, fontSize:17, letterSpacing:1 }}>🎯 TestForge</span>
        <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12 }}>Admin Panel</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:12, alignItems:"center" }}>
          {[["dashboard","Dashboard"],["create","New Test"],["students","Students"],["results","📊 Results"],["settings","⚙️ Settings"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{ padding:"7px 16px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700,
                background: view===v ? "#e8c97e" : "rgba(255,255,255,0.08)", color: view===v ? "#1a1a2e" : "rgba(255,255,255,0.7)" }}>
              {l}
            </button>
          ))}
          <button onClick={onLogout} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.15)", background:"transparent", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth:920, margin:"0 auto", padding:28 }}>

        {view === "dashboard" && (
          <>
            <div style={{ display:"flex", gap:16, marginBottom:28, flexWrap:"wrap" }}>
              {[
                { label:"Total Tests", val:tests.length, icon:"📝", color:"#3949ab" },
                { label:"Live Now", val:tests.filter(t=>getTestStatus(t)===TEST_STATUS.LIVE).length, icon:"🔴", color:"#e53935" },
                { label:"Scheduled", val:tests.filter(t=>getTestStatus(t)===TEST_STATUS.SCHEDULED).length, icon:"📅", color:"#f57c00" },
                { label:"Completed", val:tests.filter(t=>getTestStatus(t)===TEST_STATUS.ENDED).length, icon:"✅", color:"#2e7d32" },
                { label:"Students", val:studentPasswords.length, icon:"👨‍🎓", color:"#6a1b9a" },
              ].map(({ label,val,icon,color }) => (
                <div key={label} style={{ flex:"1 1 140px", background:"white", borderRadius:14, padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.06)", borderLeft:`4px solid ${color}` }}>
                  <div style={{ fontSize:24 }}>{icon}</div>
                  <div style={{ fontSize:28, fontWeight:800, color, marginTop:6 }}>{val}</div>
                  <div style={{ fontSize:13, color:"#888", marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ background:"white", borderRadius:16, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", overflow:"hidden" }}>
              <div style={{ padding:"18px 24px", borderBottom:"1px solid #f0f0f0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:800, fontSize:16, color:"#1a1a2e" }}>All Tests</div>
                <button onClick={()=>setView("create")} style={{ padding:"8px 18px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#e8c97e,#c9a227)", color:"#1a1a2e", fontWeight:800, cursor:"pointer", fontSize:13 }}>+ New Test</button>
              </div>
              {tests.length === 0 ? (
                <div style={{ padding:48, textAlign:"center", color:"#bbb" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <div>No tests yet. Create your first test!</div>
                </div>
              ) : tests.map(test => {
                const st = getTestStatus(test);
                const sc = statusColors[st];
                const shareUrl = buildShareUrl(test.id);
                return (
                  <div key={test.id} style={{ padding:"18px 24px", borderBottom:"1px solid #f9f9f9" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:180 }}>
                        <div style={{ fontWeight:700, fontSize:15, color:"#1a1a2e" }}>{test.title}</div>
                        <div style={{ fontSize:12, color:"#888", marginTop:3 }}>{test.subject} — {test.questions?.length||0} Qs — {test.durationMins} min — by {test.createdBy}</div>
                      </div>
                      <div style={{ fontSize:12, color:"#888" }}>{test.scheduledAt ? fmtDate(test.scheduledAt) : "Available Now"}</div>
                      <div style={{ padding:"4px 12px", borderRadius:20, background:sc.bg, color:sc.col, fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:sc.dot }} />{st.charAt(0).toUpperCase()+st.slice(1)}
                      </div>
                      <button onClick={()=>copyLink(test.id)}
                        style={{ padding:"7px 14px", borderRadius:8, border:"none",
                          background: copiedId===test.id ? "#e8f5e9" : "linear-gradient(135deg,#3949ab,#5c6bc0)",
                          color: copiedId===test.id ? "#2e7d32" : "white", cursor:"pointer", fontSize:12, fontWeight:700 }}>
                        {copiedId===test.id ? "Copied!" : "Share Link"}
                      </button>
                      <button onClick={()=>deleteTest(test.id)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #ffcdd2", background:"#ffebee", color:"#c62828", cursor:"pointer", fontSize:12, fontWeight:700 }}>Delete</button>
                    </div>
                    <div style={{ marginTop:10, background:"#f8f9ff", borderRadius:8, padding:"8px 12px", display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:11, color:"#888", flexShrink:0 }}>Link:</span>
                      <span style={{ fontSize:11, color:"#3949ab", fontFamily:"monospace", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shareUrl}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === "settings" && (
          <SettingsView savedDriveKey={savedDriveKey} savedModel={savedModel}
            onSave={async (driveKey, model) => {
              await dbSet("drive-api-key", driveKey);
              setSavedDriveKey(driveKey);
              setForm(f => ({ ...f, driveApiKey: driveKey }));
              await dbSet("gemini-model", model);
              setSavedModel(model);
            }} />
        )}

        {view === "results" && (
          <AdminResultsView tests={tests} />
        )}

        {view === "students" && (
          <div>
            <div style={{ background:"white", borderRadius:20, boxShadow:"0 2px 16px rgba(0,0,0,0.08)", padding:32, marginBottom:24 }}>
              <h2 style={{ margin:"0 0 8px", color:"#1a1a2e", fontSize:20 }}>Student Access Control</h2>
              <p style={{ color:"#888", fontSize:13, margin:"0 0 24px" }}>
                Add students with username + password. Only listed students can log in.
              </p>

              <div style={{ background:"#f8f9ff", borderRadius:14, padding:20, border:"1px solid #e8eaf6", marginBottom:24 }}>
                <div style={{ fontWeight:700, color:"#3949ab", fontSize:14, marginBottom:14 }}>➕ Add New Student</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:12, alignItems:"end" }}>
                  <div>
                    <Label>Full Name</Label>
                    <input value={newSP.name} onChange={e=>setNewSP(p=>({...p,name:e.target.value}))}
                      placeholder="e.g. Dushan Mehta"
                      style={{ width:"100%", padding:"11px 13px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit" }} />
                  </div>
                  <div>
                    <Label>Username (for login)</Label>
                    <input value={newSP.username} onChange={e=>setNewSP(p=>({...p,username:e.target.value}))}
                      placeholder="e.g. dushan"
                      style={{ width:"100%", padding:"11px 13px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit" }} />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <input value={newSP.password} onChange={e=>setNewSP(p=>({...p,password:e.target.value}))}
                      placeholder="e.g. dushan123"
                      style={{ width:"100%", padding:"11px 13px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit" }} />
                  </div>
                  <button onClick={addStudent}
                    style={{ padding:"11px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#3949ab,#5c6bc0)", color:"white", fontWeight:800, cursor:"pointer", fontSize:14, fontFamily:"inherit", whiteSpace:"nowrap" }}>
                    Add
                  </button>
                </div>
                {spMsg && <div style={{ marginTop:10, color: spMsg.startsWith("✅") ? "#2e7d32" : "#c62828", fontSize:13, fontWeight:600 }}>{spMsg}</div>}
              </div>

              {studentPasswords.length === 0 ? (
                <div style={{ textAlign:"center", padding:"32px 0", color:"#bbb" }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🚪</div>
                  <div>No students added yet.</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight:700, color:"#555", fontSize:13, marginBottom:12 }}>
                    {studentPasswords.length} Student{studentPasswords.length !== 1 ? "s" : ""} registered
                  </div>
                  {studentPasswords.map((sp) => (
                    <StudentPasswordRow key={sp.name} sp={sp} onRemove={removeStudent} onUpdate={updateStudentPassword} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === "create" && (
          <div style={{ background:"white", borderRadius:20, boxShadow:"0 2px 16px rgba(0,0,0,0.08)", padding:32 }}>
            <h2 style={{ margin:"0 0 6px", color:"#1a1a2e", fontSize:20 }}>Create New Test</h2>
            <p style={{ color:"#888", fontSize:13, margin:"0 0 24px" }}>
              🤖 Gemini AI extracts questions automatically — upload one combined PDF or separate PDFs per subject.
            </p>

            {/* Basic info */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
              <div style={{ gridColumn:"1/-1" }}>
                <Label>Test Title</Label>
                <Input value={form.title} onChange={v=>setForm(f=>({...f,title:v}))} placeholder="e.g. JEE Main Mock Test 1" />
              </div>
              <div>
                <Label>Subject / Topic</Label>
                <Input value={form.subject} onChange={v=>setForm(f=>({...f,subject:v}))} placeholder="Physics / Chemistry / All" />
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input type="number" value={form.durationMins} onChange={v=>setForm(f=>({...f,durationMins:v}))} placeholder="180" />
              </div>
            </div>

            <div style={{ marginTop:20 }}>
              <Label>Schedule Date and Time (leave blank for immediate)</Label>
              <input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm(f=>({...f,scheduledAt:e.target.value}))}
                style={{ padding:"11px 14px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", fontFamily:"inherit", background:"#fafafa" }} />
            </div>

            {/* Source mode tabs */}
            <div style={{ marginTop:24 }}>
              <Label>How to load the question paper?</Label>
              <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap" }}>
                {[["upload","📄 Upload PDF"],["drive","📁 Google Drive"],["demo","🎯 Demo Questions"]].map(([val,lbl])=>(
                  <button key={val} onClick={()=>setForm(f=>({...f,mode:val}))}
                    style={{ padding:"10px 20px", borderRadius:10, border:`2px solid ${form.mode===val?"#3949ab":"#e0e0e0"}`,
                      background:form.mode===val?"#e8eaf6":"white", color:form.mode===val?"#1a237e":"#888",
                      fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* ── UPLOAD MODE ── */}
            {form.mode === "upload" && (
              <div style={{ marginTop:20 }}>

                {/* Upload style toggle */}
                <div style={{ display:"flex", gap:0, marginBottom:20, borderRadius:10, overflow:"hidden", border:"2px solid #e8eaf6" }}>
                  {[["combined","📄 One Combined PDF","All subjects in a single PDF"],["separate","📚 Separate PDFs per Subject","Upload each subject individually"]].map(([val,lbl,sub])=>(
                    <button key={val} onClick={()=>setUploadMode(val)}
                      style={{ flex:1, padding:"12px 16px", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left", transition:"all 0.15s",
                        background: uploadMode===val ? "#1a237e" : "white",
                        color: uploadMode===val ? "white" : "#555",
                        borderRight: val==="combined" ? "2px solid #e8eaf6" : "none" }}>
                      <div style={{ fontWeight:800, fontSize:13 }}>{lbl}</div>
                      <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>{sub}</div>
                    </button>
                  ))}
                </div>

                {/* ── COMBINED PDF ── */}
                {uploadMode === "combined" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                    {[["Question Paper PDF", paperRef, paperFile, setPaperFile],["Answer Key PDF (optional)", keyRef, keyFile, setKeyFile]].map(([lbl,ref,file,setter])=>(
                      <div key={lbl}>
                        <Label>{lbl}</Label>
                        <div onClick={()=>ref.current.click()}
                          style={{ border:`2px dashed ${file?"#43a047":"#c5cae9"}`, borderRadius:12, padding:"24px 16px", textAlign:"center", cursor:"pointer",
                            background:file?"#f1f8e9":"#f8f9ff", transition:"all 0.15s" }}>
                          <input type="file" accept=".pdf" ref={ref} style={{ display:"none" }} onChange={e=>setter(e.target.files[0])} />
                          {file
                            ? <><div style={{ fontSize:28, marginBottom:6 }}>✅</div><div style={{ color:"#2e7d32", fontSize:13, fontWeight:700 }}>{file.name}</div><div style={{ color:"#aaa", fontSize:11, marginTop:4 }}>Click to change</div></>
                            : <><div style={{ fontSize:28, marginBottom:6 }}>📄</div><div style={{ color:"#7986cb", fontSize:13, fontWeight:600 }}>Click to upload PDF</div><div style={{ color:"#aaa", fontSize:11, marginTop:4 }}>or drag and drop</div></>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── SEPARATE PDFS PER SUBJECT ── */}
                {uploadMode === "separate" && (
                  <div>
                    <div style={{ marginBottom:14, padding:"10px 14px", background:"#e8eaf6", borderRadius:10, fontSize:12, color:"#3949ab", fontWeight:600 }}>
                      💡 Upload a separate PDF for each subject. You can disable subjects you don't need.
                    </div>

                    {sections.map((sec, si) => {
                      const colors = { Physics:{bg:"#e3f2fd",border:"#1565c0",icon:"⚛️",dark:"#1565c0"}, Chemistry:{bg:"#e8f5e9",border:"#2e7d32",icon:"🧪",dark:"#2e7d32"}, Mathematics:{bg:"#f3e5f5",border:"#6a1b9a",icon:"📐",dark:"#6a1b9a"} };
                      const col = colors[sec.subject] || {bg:"#f5f5f5",border:"#555",icon:"📚",dark:"#555"};
                      return (
                        <div key={sec.subject} style={{ marginBottom:14, borderRadius:14, border:`2px solid ${sec.enabled?col.border:"#e0e0e0"}`, overflow:"hidden", opacity:sec.enabled?1:0.5, transition:"all 0.2s" }}>
                          {/* Section header */}
                          <div style={{ background:sec.enabled?col.bg:"#f5f5f5", padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
                            <span style={{ fontSize:20 }}>{col.icon}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:800, fontSize:15, color:sec.enabled?col.dark:"#aaa" }}>{sec.subject}</div>
                              <div style={{ fontSize:11, color:"#888", marginTop:1 }}>
                                {sec.mcq} MCQ + {sec.integer} Integer = {sec.mcq + sec.integer} questions
                              </div>
                            </div>
                            {/* MCQ/Integer counts */}
                            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                                <div style={{ fontSize:10, color:"#888", marginBottom:2 }}>MCQ</div>
                                <input type="number" min="0" max="50" value={sec.mcq}
                                  onChange={e=>setSections(p=>p.map((s,i)=>i===si?{...s,mcq:Number(e.target.value)}:s))}
                                  style={{ width:50, padding:"4px 6px", borderRadius:6, border:"1px solid #ddd", fontSize:13, fontWeight:700, textAlign:"center", outline:"none" }} />
                              </div>
                              <div style={{ fontSize:16, color:"#bbb" }}>+</div>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                                <div style={{ fontSize:10, color:"#888", marginBottom:2 }}>Integer</div>
                                <input type="number" min="0" max="20" value={sec.integer}
                                  onChange={e=>setSections(p=>p.map((s,i)=>i===si?{...s,integer:Number(e.target.value)}:s))}
                                  style={{ width:50, padding:"4px 6px", borderRadius:6, border:"1px solid #ddd", fontSize:13, fontWeight:700, textAlign:"center", outline:"none" }} />
                              </div>
                            </div>
                            {/* Enable/Disable toggle */}
                            <button onClick={()=>setSections(p=>p.map((s,i)=>i===si?{...s,enabled:!s.enabled}:s))}
                              style={{ padding:"6px 14px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                                background: sec.enabled?col.dark:"#e0e0e0", color:sec.enabled?"white":"#888" }}>
                              {sec.enabled?"✓ On":"Off"}
                            </button>
                          </div>

                          {/* Upload area */}
                          {sec.enabled && (
                            <div style={{ padding:"12px 16px", background:"white" }}>
                              <div onClick={()=>sectionRefs.current[si]?.click()}
                                style={{ border:`2px dashed ${sec.file?col.border:"#ddd"}`, borderRadius:10, padding:"16px", textAlign:"center", cursor:"pointer",
                                  background:sec.file?col.bg:"#fafafa", display:"flex", alignItems:"center", gap:12, transition:"all 0.15s" }}>
                                <input type="file" accept=".pdf" ref={el=>sectionRefs.current[si]=el} style={{ display:"none" }}
                                  onChange={e=>setSections(p=>p.map((s,i)=>i===si?{...s,file:e.target.files[0]}:s))} />
                                <div style={{ fontSize:24 }}>{sec.file?"✅":"📄"}</div>
                                <div style={{ textAlign:"left", flex:1 }}>
                                  {sec.file
                                    ? <><div style={{ color:col.dark, fontSize:13, fontWeight:700 }}>{sec.file.name}</div><div style={{ color:"#888", fontSize:11, marginTop:2 }}>Click to change</div></>
                                    : <><div style={{ color:"#888", fontSize:13, fontWeight:600 }}>Click to upload {sec.subject} PDF</div><div style={{ color:"#bbb", fontSize:11, marginTop:2 }}>PDF containing only {sec.subject} questions</div></>
                                  }
                                </div>
                                {sec.file && (
                                  <button onClick={e=>{e.stopPropagation();setSections(p=>p.map((s,i)=>i===si?{...s,file:null}:s));}}
                                    style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #ffcdd2", background:"#ffebee", color:"#c62828", cursor:"pointer", fontSize:11, fontWeight:700 }}>
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Answer key for separate mode */}
                    <div style={{ marginTop:8 }}>
                      <Label>Answer Key PDF (optional — applies to all sections)</Label>
                      <div onClick={()=>keyRef.current.click()}
                        style={{ border:`2px dashed ${keyFile?"#43a047":"#ddd"}`, borderRadius:10, padding:"14px 16px", textAlign:"center", cursor:"pointer", background:keyFile?"#f1f8e9":"#fafafa" }}>
                        <input type="file" accept=".pdf" ref={keyRef} style={{ display:"none" }} onChange={e=>setKeyFile(e.target.files[0])} />
                        {keyFile?<div style={{ color:"#2e7d32", fontSize:13, fontWeight:600 }}>✅ {keyFile.name}</div>:<div style={{ color:"#bbb", fontSize:13 }}>Click to upload Answer Key PDF</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── GOOGLE DRIVE MODE ── */}
            {form.mode === "drive" && (
              <div style={{ marginTop:20, background:"#f8f9ff", borderRadius:14, padding:20, border:"1px solid #e8eaf6" }}>
                <div style={{ fontWeight:700, color:"#3949ab", marginBottom:14, fontSize:14 }}>Google Drive Settings</div>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {form.driveApiKey ? (
                    <div style={{ background:"#e8f5e9", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
                      <span>✅</span><div style={{ fontSize:13, color:"#2e7d32", fontWeight:700 }}>Drive API Key loaded from Settings</div>
                    </div>
                  ) : (
                    <div>
                      <Label>Google Drive API Key</Label>
                      <Input value={form.driveApiKey} onChange={v=>setForm(f=>({...f,driveApiKey:v}))} placeholder="AIzaSy..." />
                    </div>
                  )}
                  <div><Label>Question Paper File ID</Label><Input value={form.drivePaperFileId} onChange={v=>setForm(f=>({...f,drivePaperFileId:v}))} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs..." /></div>
                  <div><Label>Answer Key File ID (optional)</Label><Input value={form.driveKeyFileId} onChange={v=>setForm(f=>({...f,driveKeyFileId:v}))} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs..." /></div>
                </div>
              </div>
            )}

            {/* ── DEMO MODE ── */}
            {form.mode === "demo" && (
              <div style={{ marginTop:16, background:"#e8f5e9", borderRadius:12, padding:16, fontSize:13, color:"#2e7d32", border:"1px solid #a5d6a7" }}>
                Will use 9 sample JEE questions (3 Physics, 3 Chemistry, 3 Mathematics)
              </div>
            )}

            {/* Status banner */}
            {status && (
              <div style={{ marginTop:16, padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600, ...statusBannerStyle[statusType] }}>
                {status}
              </div>
            )}

            <div style={{ display:"flex", gap:12, marginTop:24 }}>
              <button onClick={()=>{ setView("dashboard"); setStatus(""); setSections(DEFAULT_SECTIONS); setUploadMode("combined"); }}
                style={{ padding:"13px 24px", borderRadius:12, border:"2px solid #e0e0e0", background:"white", color:"#555", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              <button onClick={createTest} disabled={loading}
                style={{ flex:1, padding:"13px", borderRadius:12, border:"none", background:loading?"#ccc":"linear-gradient(135deg,#1a237e,#3949ab)", color:"white", fontWeight:800, cursor:loading?"default":"pointer", fontSize:15, fontFamily:"inherit" }}>
                {loading ? "⏳ Processing..." : "🚀 Create Test"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SETTINGS VIEW  — only Drive key here now
   Gemini key is server-side (Render env var)
───────────────────────────────────────────── */
function SettingsView({ savedDriveKey, savedModel, onSave }) {
  const [drive, setDrive] = useState(savedDriveKey || "");
  const [model, setModel] = useState(savedModel || "gemini-2.0-flash");
  const [msg, setMsg] = useState("");
  const [showDrive, setShowDrive] = useState(false);
  const [liveModels, setLiveModels] = useState([]);

  useEffect(() => { setDrive(savedDriveKey || ""); }, [savedDriveKey]);
  useEffect(() => { setModel(savedModel || "gemini-2.0-flash"); }, [savedModel]);

  // Fetch live model list from server on mount
  useEffect(() => {
    fetch("/api/models")
      .then(r => r.json())
      .then(d => { if (d.models?.length) setLiveModels(d.models); })
      .catch(() => {});
  }, []);

  const save = async () => {
    await onSave(drive.trim(), model);
    setMsg("✅ Settings saved!");
    setTimeout(() => setMsg(""), 3000);
  };

  const maskKey = (k) => k.length > 8 ? k.slice(0,6) + "••••••••" + k.slice(-4) : k ? "••••••••" : "";

  // Static fallback UI info — actual working models come from server dynamically
  const MODEL_META = {
    "gemini-2.5-flash":      { label: "Gemini 2.5 Flash",      badge: "⚡ Best",        badgeColor: "#2e7d32", badgeBg: "#e8f5e9", note: "Fastest + smartest — recommended" },
    "gemini-2.5-flash-lite": { label: "Gemini 2.5 Flash Lite",  badge: "🚀 Lite",        badgeColor: "#1565c0", badgeBg: "#e3f2fd", note: "Lighter, use if quota is tight" },
    "gemini-2.5-pro":        { label: "Gemini 2.5 Pro",         badge: "🧠 Pro",         badgeColor: "#6a1b9a", badgeBg: "#f3e5f5", note: "Most accurate, lower quota" },
    "gemini-2.0-flash":      { label: "Gemini 2.0 Flash",       badge: "✅ Stable",      badgeColor: "#e65100", badgeBg: "#fff3e0", note: "Stable fallback" },
    "gemini-2.0-flash-lite": { label: "Gemini 2.0 Flash Lite",  badge: "🔄 Fallback",    badgeColor: "#00695c", badgeBg: "#e0f2f1", note: "Lightweight fallback" },
  };
  const MODELS = liveModels.length > 0
    ? liveModels.slice(0, 5).map((id, i) => ({
        id,
        label: MODEL_META[id]?.label || id,
        badge: i === 0 ? "⚡ Best Available" : (MODEL_META[id]?.badge || "🔄 Available"),
        badgeColor: i === 0 ? "#2e7d32" : (MODEL_META[id]?.badgeColor || "#555"),
        badgeBg: i === 0 ? "#e8f5e9" : (MODEL_META[id]?.badgeBg || "#f5f5f5"),
        note: MODEL_META[id]?.note || "Available on your API key",
        limit: "free tier",
      }))
    : [
        { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", badge: "⚡ Default", badgeColor: "#2e7d32", badgeBg: "#e8f5e9", note: "Loading live models...", limit: "free tier" },
      ];

  return (
    <div style={{ maxWidth:660 }}>
      <h2 style={{ margin:"0 0 6px", color:"#1a1a2e", fontSize:20 }}>⚙️ Settings</h2>
      <p style={{ color:"#888", fontSize:13, margin:"0 0 28px" }}>
        Configure your AI model and API keys. Changes take effect immediately for the next test you create.
      </p>

      {/* ── Gemini Model Switcher ── */}
      <div style={{ background:"white", borderRadius:16, padding:24, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", marginBottom:16, border:"2px solid #e8eaf6" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
          <span style={{ fontSize:22 }}>🤖</span>
          <div>
            <div style={{ fontWeight:800, color:"#1a1a2e", fontSize:15 }}>Gemini AI Model</div>
            <div style={{ fontSize:12, color:"#888" }}>Switch models if you hit quota limits</div>
          </div>
          <span style={{ marginLeft:"auto", background:"#e8eaf6", color:"#3949ab", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 }}>
            Active: {MODEL_META[model]?.label || model}
          </span>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {MODELS.map(m => (
            <div
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                padding:"14px 16px", borderRadius:12, cursor:"pointer", transition:"all 0.15s",
                border: model === m.id ? "2px solid #3949ab" : "2px solid #e8eaf6",
                background: model === m.id ? "#f0f4ff" : "#fafafa",
                display:"flex", alignItems:"center", gap:14,
              }}
            >
              {/* Radio dot */}
              <div style={{
                width:18, height:18, borderRadius:"50%", flexShrink:0,
                border: model === m.id ? "5px solid #3949ab" : "2px solid #ccc",
                background: "white", transition:"all 0.15s",
              }} />
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontWeight:700, fontSize:14, color:"#1a1a2e" }}>{m.label}</span>
                  <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:m.badgeBg, color:m.badgeColor }}>{m.badge}</span>
                </div>
                <div style={{ fontSize:12, color:"#888" }}>{m.note}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#555" }}>{m.limit}</div>
                <div style={{ fontSize:10, color:"#bbb" }}>free tier</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop:14, padding:"10px 14px", borderRadius:10, background:"#fffde7", border:"1px solid #ffe082", fontSize:12, color:"#7c6a00" }}>
          💡 <b>Quota tip:</b> If you see "quota exceeded", just switch to a different model above — each model has its own separate quota.
        </div>
      </div>

      {/* ── Gemini API Key info ── */}
      <div style={{ background:"white", borderRadius:16, padding:24, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", marginBottom:16, border:"1px solid #e8f5e9" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>🔑</span>
          <div>
            <div style={{ fontWeight:800, color:"#1a1a2e", fontSize:15 }}>Gemini API Key</div>
            <div style={{ fontSize:12, color:"#888" }}>Stored securely as a Render environment variable</div>
          </div>
          <span style={{ marginLeft:"auto", background:"#e8f5e9", color:"#2e7d32", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 }}>🔒 Server-side</span>
        </div>
        <div style={{ marginTop:12, background:"#f8f9ff", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#555" }}>
          To change: go to <b>Render → Your Service → Environment</b> → update <code style={{ background:"#e8eaf6", padding:"1px 6px", borderRadius:4 }}>GEMINI_API_KEY</code> → Save → Redeploy.
        </div>
      </div>

      {/* ── Drive key ── */}
      <div style={{ background:"white", borderRadius:16, padding:24, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", marginBottom:24, border:"1px solid #e3f2fd" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <span style={{ fontSize:22 }}>📁</span>
          <div>
            <div style={{ fontWeight:800, color:"#1a1a2e", fontSize:15 }}>Google Drive API Key</div>
            <div style={{ fontSize:12, color:"#888" }}>Used to fetch PDFs directly from your Google Drive</div>
          </div>
          {savedDriveKey && (
            <span style={{ marginLeft:"auto", background:"#e8f5e9", color:"#2e7d32", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 }}>✅ Saved</span>
          )}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14, alignItems:"center" }}>
          <div style={{ position:"relative", flex:1 }}>
            <input
              type={showDrive ? "text" : "password"}
              value={drive}
              onChange={e => setDrive(e.target.value)}
              placeholder="AIzaSy..."
              style={{ width:"100%", padding:"11px 42px 11px 13px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", background:"#fafafa", boxSizing:"border-box", fontFamily:"monospace" }}
            />
            <button onClick={() => setShowDrive(p=>!p)}
              style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#aaa" }}>
              {showDrive ? "🙈" : "👁️"}
            </button>
          </div>
        </div>
        {savedDriveKey && !showDrive && (
          <div style={{ fontSize:12, color:"#aaa", marginTop:6, fontFamily:"monospace" }}>Current: {maskKey(savedDriveKey)}</div>
        )}
        <div style={{ fontSize:12, color:"#888", marginTop:10 }}>
          Get key → <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer"
            style={{ color:"#3949ab", fontWeight:700 }}>Google Cloud Console → Credentials → Create API Key</a>
        </div>
      </div>

      <button onClick={save}
        style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1a1a2e,#3949ab)", color:"white", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"Georgia, serif" }}>
        💾 Save Settings
      </button>
      {msg && (
        <div style={{ marginTop:14, padding:"12px 16px", borderRadius:10, background:"#e8f5e9", color:"#2e7d32", fontSize:13, fontWeight:600, border:"1px solid #a5d6a7" }}>
          {msg}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ADMIN RESULTS VIEW
───────────────────────────────────────────── */
function AdminResultsView({ tests }) {
  const [allResults, setAllResults] = useState({});
  const [selectedTest, setSelectedTest] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await dbGet("all-results") || {};
      setAllResults(r);
      if (tests.length > 0) setSelectedTest(tests[0]);
    })();
  }, [tests]);

  if (tests.length === 0) return (
    <div style={{ background:"white", borderRadius:16, padding:48, textAlign:"center", color:"#bbb", boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
      <div>No tests created yet.</div>
    </div>
  );

  const testEntries = selectedTest
    ? Object.entries(allResults).filter(([k]) => k.startsWith(selectedTest.id + "__"))
    : [];

  return (
    <div>
      <h2 style={{ margin:"0 0 20px", color:"#1a1a2e", fontSize:20 }}>📊 Student Results & Marks</h2>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:24 }}>
        {tests.map(t => (
          <button key={t.id} onClick={() => setSelectedTest(t)}
            style={{ padding:"9px 18px", borderRadius:10, border:`2px solid ${selectedTest?.id===t.id?"#e8c97e":"#e0e0e0"}`,
              background: selectedTest?.id===t.id ? "#fffde7" : "white",
              color: selectedTest?.id===t.id ? "#7c6a00" : "#555",
              fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"Georgia, serif" }}>
            {t.title}
          </button>
        ))}
      </div>

      {selectedTest && (
        <div style={{ background:"white", borderRadius:16, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", overflow:"hidden" }}>
          <div style={{ padding:"16px 24px", borderBottom:"1px solid #f0f0f0", background:"#f8f9ff" }}>
            <div style={{ fontWeight:800, fontSize:15, color:"#1a1a2e" }}>{selectedTest.title}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:3 }}>{selectedTest.questions?.length||0} Questions — {testEntries.length} submission(s)</div>
          </div>

          {testEntries.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"#bbb" }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📋</div>
              <div>No submissions yet for this test.</div>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
              <thead>
                <tr style={{ background:"#f4f6fb" }}>
                  {["#","Student Name","Score","Marks","Correct","Wrong","Skipped","Time Taken"].map(h => (
                    <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontWeight:700, color:"#555", fontSize:12, borderBottom:"2px solid #e8eaf6" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testEntries.sort((a,b) => {
                  const scoreOf = ([,sub]) => {
                    const qs = selectedTest.questions || DEMO_QUESTIONS;
                    return qs.reduce((acc,q,i) => {
                      const given = sub.answers[i];
                      const blank = given===undefined||given===null||given===""||( typeof given==="number"&&isNaN(given));
                      const correct = !blank && String(given)===String(q.correct);
                      const wrong = !blank && !correct;
                      return acc + (correct?q.marks:wrong?q.negative:0);
                    }, 0);
                  };
                  return scoreOf(b) - scoreOf(a);
                }).map(([key, sub], rowIdx) => {
                  const studentName = key.replace(selectedTest.id + "__", "");
                  const qs = selectedTest.questions || DEMO_QUESTIONS;
                  let score=0, maxM=0, nC=0, nW=0, nS=0;
                  qs.forEach((q,i) => {
                    const given = sub.answers[i];
                    const blank = given===undefined||given===null||given===""||( typeof given==="number"&&isNaN(given));
                    const correct = !blank && String(given)===String(q.correct);
                    const wrong = !blank && !correct;
                    maxM += q.marks;
                    if (correct) { score += q.marks; nC++; }
                    else if (wrong) { score += q.negative; nW++; }
                    else nS++;
                  });
                  const pct = Math.max(0, Math.round((score/maxM)*100));
                  const pctC = pct>=70?"#2e7d32":pct>=40?"#f57c00":"#e53935";
                  return (
                    <tr key={key} style={{ borderBottom:"1px solid #f5f5f5", background: rowIdx%2===0?"white":"#fafbff" }}>
                      <td style={{ padding:"12px 16px", color:"#aaa", fontWeight:700 }}>{rowIdx+1}</td>
                      <td style={{ padding:"12px 16px", fontWeight:700, color:"#1a1a2e" }}>{studentName}</td>
                      <td style={{ padding:"12px 16px" }}>
                        <span style={{ fontWeight:800, color:pctC, fontSize:16 }}>{pct}%</span>
                      </td>
                      <td style={{ padding:"12px 16px", fontWeight:700 }}>{score}/{maxM}</td>
                      <td style={{ padding:"12px 16px", color:"#43a047", fontWeight:700 }}>{nC}</td>
                      <td style={{ padding:"12px 16px", color:"#e53935", fontWeight:700 }}>{nW}</td>
                      <td style={{ padding:"12px 16px", color:"#9e9e9e", fontWeight:700 }}>{nS}</td>
                      <td style={{ padding:"12px 16px", color:"#555" }}>{fmt(sub.timeTaken || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STUDENT PASSWORD ROW
───────────────────────────────────────────── */
function StudentPasswordRow({ sp, onRemove, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [newPass, setNewPass] = useState(sp.password);

  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"#fafbff", borderRadius:10, marginBottom:8, border:"1px solid #e8eaf6" }}>
      <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#3949ab,#5c6bc0)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, flexShrink:0 }}>
        {sp.name[0].toUpperCase()}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, color:"#1a1a2e", fontSize:14 }}>{sp.name}</div>
        <div style={{ fontSize:12, color:"#3949ab", marginTop:1 }}>@{sp.username || sp.name}</div>
        {editing ? (
          <div style={{ display:"flex", gap:8, marginTop:6 }}>
            <input value={newPass} onChange={e=>setNewPass(e.target.value)}
              style={{ padding:"6px 10px", borderRadius:7, border:"1px solid #3949ab", fontSize:13, outline:"none", flex:1 }} />
            <button onClick={()=>{ onUpdate(sp.name, newPass); setEditing(false); }}
              style={{ padding:"6px 12px", borderRadius:7, border:"none", background:"#3949ab", color:"white", fontWeight:700, cursor:"pointer", fontSize:12 }}>Save</button>
            <button onClick={()=>{ setNewPass(sp.password); setEditing(false); }}
              style={{ padding:"6px 10px", borderRadius:7, border:"1px solid #ddd", background:"white", cursor:"pointer", fontSize:12 }}>Cancel</button>
          </div>
        ) : (
          <div style={{ fontSize:12, color:"#888", marginTop:2 }}>Password: {"*".repeat(sp.password.length)}</div>
        )}
      </div>
      {!editing && (
        <button onClick={()=>setEditing(true)}
          style={{ padding:"6px 12px", borderRadius:7, border:"1px solid #e8eaf6", background:"white", color:"#3949ab", cursor:"pointer", fontSize:12, fontWeight:700 }}>
          Edit
        </button>
      )}
      <button onClick={()=>onRemove(sp.name)}
        style={{ padding:"6px 12px", borderRadius:7, border:"1px solid #ffcdd2", background:"#ffebee", color:"#c62828", cursor:"pointer", fontSize:12, fontWeight:700 }}>
        Remove
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STUDENT SCREEN
───────────────────────────────────────────── */
function StudentScreen({ user, tests, onStart, onLogout, serverReady, onViewResult }) {
  const available = tests.filter(t => getTestStatus(t) === TEST_STATUS.LIVE);
  const upcoming = tests.filter(t => getTestStatus(t) === TEST_STATUS.SCHEDULED);
  const ended = tests.filter(t => getTestStatus(t) === TEST_STATUS.ENDED);
  const [submittedIds, setSubmittedIds] = useState(new Set());
  const [allResults, setAllResults] = useState({});

  useEffect(() => {
    (async () => {
      const r = await dbGet("all-results") || {};
      setAllResults(r);
      const ids = new Set(
        Object.keys(r)
          .filter(k => k.endsWith("__" + user.name))
          .map(k => k.replace("__" + user.name, ""))
      );
      setSubmittedIds(ids);
    })();
  }, [user.name]);

  // All tests the student has submitted
  const submittedTests = tests.filter(t => submittedIds.has(t.id));

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fb", fontFamily:"Georgia, serif" }}>
      {/* Server cold-start warning banner */}
      {!serverReady && (
        <div style={{ background:"#ff6f00", color:"white", padding:"10px 20px", textAlign:"center", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>⏳</span>
          Server is waking up (free tier cold start) — please wait 30–60 seconds, then try again.
          <button onClick={()=>window.location.reload()} style={{ marginLeft:12, padding:"4px 12px", borderRadius:6, border:"none", background:"white", color:"#ff6f00", fontWeight:800, cursor:"pointer", fontSize:12 }}>
            Refresh
          </button>
        </div>
      )}
      <div style={{ background:"linear-gradient(135deg,#1a1a2e,#16213e)", color:"white", padding:"0 24px", height:58, display:"flex", alignItems:"center", gap:16 }}>
        <span style={{ color:"#e8c97e", fontWeight:800, fontSize:17, letterSpacing:1 }}>🎯 TestForge</span>
        <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12 }}>Student Portal</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:12, alignItems:"center" }}>
          <span style={{ color:"rgba(255,255,255,0.6)", fontSize:13 }}>👤 {user.name}</span>
          <button onClick={onLogout} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.15)", background:"transparent", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:28 }}>
        <div style={{ fontWeight:800, fontSize:22, color:"#1a1a2e", marginBottom:6 }}>Welcome back, {user.name}</div>
        <div style={{ color:"#888", fontSize:14, marginBottom:28 }}>Here are your available tests</div>

        <Section title="Available Now" count={available.length} color="#e53935">
          {available.length === 0 ? <Empty text="No live tests right now" /> : available.map(test => (
            <TestCard key={test.id} test={test} status={TEST_STATUS.LIVE}
              action={
                submittedIds.has(test.id)
                  ? <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ padding:"10px 18px", borderRadius:10, background:"#e8f5e9", color:"#2e7d32", fontWeight:700, fontSize:13 }}>✅ Submitted</span>
                      <button onClick={() => onViewResult(test, allResults[`${test.id}__${user.name}`])}
                        style={{ padding:"10px 16px", borderRadius:10, border:"1px solid #1a237e", background:"white", color:"#1a237e", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                        📊 View Analysis
                      </button>
                    </div>
                  : <button onClick={()=>onStart(test)} style={{ padding:"10px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#e53935,#c62828)", color:"white", fontWeight:800, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>Start Test</button>
              } />
          ))}
        </Section>

        <Section title="Scheduled" count={upcoming.length} color="#f57c00">
          {upcoming.length === 0 ? <Empty text="No upcoming tests" /> : upcoming.map(test => (
            <TestCard key={test.id} test={test} status={TEST_STATUS.SCHEDULED}
              action={<Countdown target={new Date(test.scheduledAt).getTime()} />} />
          ))}
        </Section>

        <Section title="Completed" count={ended.length} color="#2e7d32">
          {ended.length === 0 ? <Empty text="No past tests" /> : ended.map(test => (
            <TestCard key={test.id} test={test} status={TEST_STATUS.ENDED}
              action={
                submittedIds.has(test.id)
                  ? <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ padding:"8px 14px", borderRadius:10, background:"#e8f5e9", color:"#2e7d32", fontWeight:700, fontSize:13 }}>✅ Submitted</span>
                      <button onClick={() => onViewResult(test, allResults[`${test.id}__${user.name}`])}
                        style={{ padding:"8px 14px", borderRadius:10, border:"1px solid #1a237e", background:"white", color:"#1a237e", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                        📊 View Analysis
                      </button>
                    </div>
                  : <span style={{ color:"#888", fontSize:13 }}>Test ended</span>
              } />
          ))}
        </Section>

        {/* Analysis Section — all submitted tests */}
        {submittedTests.length > 0 && (
          <Section title="📊 My Analysis" count={submittedTests.length} color="#1a237e">
            {submittedTests.map(test => {
              const sub = allResults[`${test.id}__${user.name}`];
              if (!sub) return null;
              const qs = test.questions || [];
              const results = qs.map((q, i) => {
                const given = sub.answers?.[i];
                const blank = given === undefined || given === null || given === "" || (typeof given === "number" && isNaN(given));
                const correct = !blank && String(given) === String(q.correct);
                const wrong = !blank && !correct;
                const qMarks = Number(q.marks) || 4;
                const qNeg = q.negative !== undefined ? Number(q.negative) : -1;
                return { correct, wrong, blank, earned: correct ? qMarks : wrong ? qNeg : 0, marks: qMarks };
              });
              const scored = results.reduce((s, r) => s + r.earned, 0);
              const maxMarks = results.reduce((s, r) => s + r.marks, 0);
              const nC = results.filter(r => r.correct).length;
              const nW = results.filter(r => r.wrong).length;
              const nS = results.filter(r => r.blank).length;
              const pct = maxMarks > 0 ? Math.max(0, Math.round((scored / maxMarks) * 100)) : 0;
              const scoreColor = pct >= 70 ? "#2e7d32" : pct >= 40 ? "#f57c00" : "#e53935";
              return (
                <div key={test.id} style={{ background:"white", borderRadius:16, padding:"18px 22px", marginBottom:12, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:"#1a1a2e" }}>{test.title}</div>
                      <div style={{ fontSize:12, color:"#888", marginTop:3 }}>{test.subject} — {qs.length} Questions — {test.durationMins} min</div>
                      <div style={{ display:"flex", gap:14, marginTop:10, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, color:"#43a047", fontWeight:700 }}>✅ {nC} Correct</span>
                        <span style={{ fontSize:13, color:"#e53935", fontWeight:700 }}>❌ {nW} Wrong</span>
                        <span style={{ fontSize:13, color:"#9e9e9e", fontWeight:700 }}>⬜ {nS} Skipped</span>
                        <span style={{ fontSize:13, color:"#555" }}>⏱ {fmt(sub.timeTaken || 0)}</span>
                      </div>
                      {/* Score bar */}
                      <div style={{ marginTop:10, maxWidth:300 }}>
                        <div style={{ height:7, background:"#f0f0f0", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:scoreColor, borderRadius:4, transition:"width 0.5s" }} />
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:28, fontWeight:900, color:scoreColor }}>{scored}</div>
                      <div style={{ fontSize:11, color:"#888" }}>/{maxMarks} marks</div>
                      <div style={{ fontSize:15, fontWeight:700, color:scoreColor, marginTop:2 }}>{pct}%</div>
                      <button onClick={() => onViewResult(test, sub)}
                        style={{ marginTop:10, padding:"9px 18px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#1a237e,#3949ab)", color:"white", fontWeight:700, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
                        Full Analysis →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, color, children }) {
  return (
    <div style={{ marginBottom:32 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <div style={{ fontWeight:800, fontSize:16, color:"#1a1a2e" }}>{title}</div>
        <div style={{ background:color, color:"white", borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700 }}>{count}</div>
      </div>
      {children}
    </div>
  );
}
function Empty({ text }) {
  return <div style={{ background:"white", borderRadius:14, padding:"24px", textAlign:"center", color:"#bbb", fontSize:14, boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>{text}</div>;
}
function TestCard({ test, status, action }) {
  const sc = { [TEST_STATUS.LIVE]:{bg:"#e8f5e9",col:"#2e7d32"}, [TEST_STATUS.SCHEDULED]:{bg:"#fff3e0",col:"#e65100"}, [TEST_STATUS.ENDED]:{bg:"#f5f5f5",col:"#616161"} };
  return (
    <div style={{ background:"white", borderRadius:16, padding:"20px 24px", marginBottom:12, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:180 }}>
        <div style={{ fontWeight:700, fontSize:16, color:"#1a1a2e" }}>{test.title}</div>
        <div style={{ fontSize:13, color:"#888", marginTop:4 }}>{test.subject} — {test.questions?.length||0} Questions — {test.durationMins} min</div>
        <div style={{ fontSize:12, color:"#aaa", marginTop:3 }}>{test.scheduledAt ? `Scheduled: ${fmtDate(test.scheduledAt)}` : "Available immediately"}</div>
      </div>
      {action}
    </div>
  );
}
function Countdown({ target }) {
  const [diff, setDiff] = useState(Math.max(0, Math.floor((target - Date.now()) / 1000)));
  useEffect(() => { const t = setInterval(()=>setDiff(Math.max(0, Math.floor((target-Date.now())/1000))), 1000); return ()=>clearInterval(t); }, [target]);
  const h = Math.floor(diff/3600), m = Math.floor((diff%3600)/60), s = diff%60;
  return <div style={{ fontWeight:800, fontSize:18, color:"#e65100", fontVariantNumeric:"tabular-nums" }}>{`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}</div>;
}

/* ─────────────────────────────────────────────
   INSTRUCTIONS SCREEN  (shown before test starts)
   Matches NTA / IIT-School style consent page
───────────────────────────────────────────── */
function InstructionsScreen({ test, student, onProceed, onBack }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fb", fontFamily:"Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1a237e,#283593)", color:"white", padding:"0 24px", height:56, display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ background:"#ffca28", color:"#1a237e", fontWeight:900, fontSize:13, padding:"3px 10px", borderRadius:4, letterSpacing:1 }}>NTA</div>
        <div>
          <div style={{ fontWeight:800, fontSize:13 }}>JEE (Main)</div>
          <div style={{ fontSize:10, opacity:0.6 }}>National Testing Agency</div>
        </div>
        <div style={{ flex:1, textAlign:"center", fontWeight:700, fontSize:15 }}>{test.title}</div>
        <div style={{ fontSize:13, opacity:0.8 }}>👤 {student.name}</div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 20px" }}>
        {/* Title box */}
        <div style={{ background:"#1a237e", color:"white", padding:"12px 20px", borderRadius:"8px 8px 0 0", fontWeight:800, fontSize:16, letterSpacing:0.5 }}>
          GENERAL INSTRUCTIONS
        </div>
        <div style={{ background:"white", borderRadius:"0 0 8px 8px", boxShadow:"0 2px 12px rgba(0,0,0,0.08)", padding:"28px 28px 20px" }}>
          <p style={{ textAlign:"center", fontWeight:700, fontSize:15, marginTop:0, marginBottom:24, color:"#1a237e" }}>Please read the instructions carefully</p>

          <h3 style={{ color:"#1a237e", borderBottom:"2px solid #1a237e", paddingBottom:6, marginTop:0 }}>General Instructions:</h3>
          <ol style={{ lineHeight:2, fontSize:14, color:"#333", paddingLeft:22 }}>
            <li>The clock will be set at the server. The countdown timer in the top right corner of the screen will display the remaining time available for you to complete the examination. When the timer reaches zero, the examination will end automatically.</li>
            <li>The Questions Palette on the right side of the screen will show the status of each question:
              <ol type="a" style={{ marginTop:8, lineHeight:2 }}>
                <li><span style={{ display:"inline-block", width:22, height:22, borderRadius:"50%", background:"#787878", color:"white", textAlign:"center", lineHeight:"22px", fontSize:12, fontWeight:700, marginRight:6 }}>1</span> You have <b>not visited</b> the question yet.</li>
                <li><span style={{ display:"inline-block", width:22, height:22, borderRadius:"50%", background:"#c0392b", color:"white", textAlign:"center", lineHeight:"22px", fontSize:12, fontWeight:700, marginRight:6 }}>2</span> You have <b>not answered</b> the question.</li>
                <li><span style={{ display:"inline-block", width:22, height:22, borderRadius:"50%", background:"#26a541", color:"white", textAlign:"center", lineHeight:"22px", fontSize:12, fontWeight:700, marginRight:6 }}>3</span> You have <b>answered</b> the question.</li>
                <li><span style={{ display:"inline-block", width:22, height:22, borderRadius:"50%", background:"#8b3fa8", color:"white", textAlign:"center", lineHeight:"22px", fontSize:12, fontWeight:700, marginRight:6 }}>4</span> You have <b>NOT answered</b> but marked the question for review.</li>
                <li><span style={{ display:"inline-block", width:22, height:22, borderRadius:"50%", background:"#8b3fa8", color:"white", textAlign:"center", lineHeight:"22px", fontSize:12, fontWeight:700, marginRight:6, border:"3px solid #26a541" }}>5</span> <b>Answered and Marked for Review</b> — will be considered for evaluation.</li>
              </ol>
            </li>
            <li>You can use the <b>question palette</b> on the right to navigate directly to any question. This does NOT save your current answer.</li>
          </ol>

          <h3 style={{ color:"#1a237e", borderBottom:"2px solid #1a237e", paddingBottom:6 }}>Navigating to a Question:</h3>
          <ol start={4} style={{ lineHeight:2, fontSize:14, color:"#333", paddingLeft:22 }}>
            <li>Click on the question number in the Question Palette to go directly to that question. Note: this does NOT save your answer.</li>
            <li>Click <b>Save &amp; Next</b> to save your answer and go to the next question.</li>
            <li>Click <b>Mark for Review &amp; Next</b> to save and mark the question, then proceed to the next question.</li>
          </ol>

          <h3 style={{ color:"#1a237e", borderBottom:"2px solid #1a237e", paddingBottom:6 }}>Answering a Question:</h3>
          <ol start={7} style={{ lineHeight:2, fontSize:14, color:"#333", paddingLeft:22 }}>
            <li>For <b>Multiple Choice</b> questions: click the option button to select. Click again or click <b>Clear Response</b> to deselect.</li>
            <li>For <b>Integer type</b> questions: enter the numeric answer using the on-screen keypad.</li>
            <li>To change your answer, select a different option or re-enter the value.</li>
            <li>You must click <b>Save &amp; Next</b> to confirm your answer.</li>
          </ol>

          <h3 style={{ color:"#1a237e", borderBottom:"2px solid #1a237e", paddingBottom:6 }}>Marking Scheme:</h3>
          <ol start={11} style={{ lineHeight:2, fontSize:14, color:"#333", paddingLeft:22 }}>
            <li><b>MCQ:</b> +4 for correct answer, −1 for incorrect answer, 0 for skipped.</li>
            <li><b>Integer type:</b> +4 for correct answer, 0 for incorrect or skipped (no negative marking).</li>
            <li>After clicking <b>Save &amp; Next</b> on the last question of a section, you will be taken to the first question of the next section.</li>
            <li>You can move between questions freely during the examination time.</li>
          </ol>

          {/* Exam details */}
          <div style={{ background:"#e8eaf6", borderRadius:8, padding:"14px 18px", marginTop:16, marginBottom:20, fontSize:14 }}>
            <div style={{ fontWeight:700, color:"#1a237e", marginBottom:8 }}>📋 Exam Details</div>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap", color:"#333" }}>
              <span>📚 <b>Subject:</b> {test.subject || "Mixed"}</span>
              <span>❓ <b>Questions:</b> {test.questions?.length || 0}</span>
              <span>⏱ <b>Duration:</b> {test.durationMins || 180} minutes</span>
              <span>👤 <b>Candidate:</b> {student.name}</span>
            </div>
          </div>

          {/* Consent checkbox — matches screenshot */}
          <div style={{ borderTop:"1px solid #e0e0e0", paddingTop:18, marginTop:8 }}>
            <label style={{ display:"flex", gap:12, cursor:"pointer", fontSize:13, color:"#333", lineHeight:1.6, alignItems:"flex-start" }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                style={{ marginTop:3, width:18, height:18, cursor:"pointer", flexShrink:0 }} />
              <span>
                I have read and understood the instructions. All computer hardware allotted to me are in proper working condition.
                I declare that I am not in possession of / not wearing / not carrying any prohibited gadget like mobile phone,
                bluetooth devices etc. / any prohibited material with me into the Examination Hall. I agree that in case of not
                adhering to the instructions, I shall be liable to be debarred from this Test and/or to disciplinary action,
                which may include ban from future Tests / Examinations.
              </span>
            </label>
          </div>

          <div style={{ display:"flex", gap:12, marginTop:20, justifyContent:"center" }}>
            <button onClick={onBack}
              style={{ padding:"11px 28px", borderRadius:8, border:"1px solid #bbb", background:"white", color:"#555", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
              ← Go Back
            </button>
            <button onClick={onProceed} disabled={!agreed}
              style={{ padding:"11px 32px", borderRadius:8, border:"none",
                background: agreed ? "linear-gradient(135deg,#26a541,#1b5e20)" : "#bbb",
                color:"white", fontWeight:800, fontSize:14,
                cursor: agreed ? "pointer" : "not-allowed", fontFamily:"inherit", letterSpacing:0.3 }}>
              PROCEED →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TEST SCREEN  (NTA-style)
───────────────────────────────────────────── */
const Q_STATUS = { NV:"nv", NA:"na", ANS:"ans", MR:"mr", AMR:"amr" };
const Q_COLORS = { nv:"#787878", na:"#c0392b", ans:"#26a541", mr:"#8b3fa8", amr:"#8b3fa8" };

/* ─────────────────────────────────────────────
   TEST SCREEN  — NTA JEE style
───────────────────────────────────────────── */
function TestScreen({ test, student, onSubmit }) {
  const allQs = test.questions || DEMO_QUESTIONS;
  const draftKey = `draft__${test.id}__${student.name}`;
  const savedDraft = sessionGet(draftKey) || {};

  // Subject sections — Physics, Chemistry, Mathematics (in order)
  const SECTION_ORDER = ["Physics", "Chemistry", "Mathematics"];
  const subjects = SECTION_ORDER.filter(s => allQs.some(q => q.subject === s));
  // Add any other subjects not in the order list
  allQs.forEach(q => { if (!subjects.includes(q.subject)) subjects.push(q.subject); });

  const [activeSub, setActiveSub] = useState(savedDraft.activeSub || subjects[0]);
  // Global index across ALL questions
  const [globalIdx, setGlobalIdx] = useState(savedDraft.globalIdx ?? 0);
  const [answers, setAnswers] = useState(savedDraft.answers || {});
  const [intInputs, setIntInputs] = useState(savedDraft.intInputs || {});
  const [qStatus, setQStatus] = useState(() => {
    if (savedDraft.qStatus) return savedDraft.qStatus;
    const s = {}; allQs.forEach((_, i) => s[i] = Q_STATUS.NV); return s;
  });
  const [timeLeft, setTimeLeft] = useState(savedDraft.timeLeft ?? (test.durationMins || 180) * 60);
  const [confirm, setConfirm] = useState(false);

  // Questions for active subject
  const subQs = allQs.map((q, gi) => ({ ...q, gi })).filter(q => q.subject === activeSub);
  // Current global index limited to active subject
  const curSubQ = subQs.find(q => q.gi === globalIdx) || subQs[0];
  const cur = curSubQ ? allQs[curSubQ.gi] : allQs[0];
  const curGi = curSubQ ? curSubQ.gi : 0;

  // When switching subject tab, go to first question of that subject
  const switchSubject = (sub) => {
    setActiveSub(sub);
    const firstQ = allQs.findIndex(q => q.subject === sub);
    if (firstQ !== -1) {
      if (qStatus[firstQ] === Q_STATUS.NV) setQStatus(p => ({ ...p, [firstQ]: Q_STATUS.NA }));
      setGlobalIdx(firstQ);
    }
  };

  // Mark current question as visited when entering
  useEffect(() => {
    setQStatus(p => {
      if (p[globalIdx] === Q_STATUS.NV) return { ...p, [globalIdx]: Q_STATUS.NA };
      return p;
    });
  }, [globalIdx]);

  useEffect(() => {
    sessionSet(draftKey, { activeSub, globalIdx, answers, intInputs, qStatus, timeLeft });
  }, [activeSub, globalIdx, answers, intInputs, qStatus, timeLeft]);

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => {
      if (p <= 1) { clearInterval(t); doSubmit(); return 0; }
      return p - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  const setQS = (gi, s) => setQStatus(p => ({ ...p, [gi]: s }));

  const saveAndNext = (mark = false) => {
    const ans = cur.type === "integer" ? intInputs[curGi] : answers[curGi];
    const has = ans !== undefined && ans !== null && ans !== "";
    const newStatus = has ? (mark ? Q_STATUS.AMR : Q_STATUS.ANS) : (mark ? Q_STATUS.MR : Q_STATUS.NA);
    setQS(curGi, newStatus);

    // Find next question in current subject
    const curPosInSub = subQs.findIndex(q => q.gi === curGi);
    if (curPosInSub < subQs.length - 1) {
      const nextGi = subQs[curPosInSub + 1].gi;
      setGlobalIdx(nextGi);
    }
  };

  const doSubmit = () => {
    const finalAns = {};
    allQs.forEach((q, i) => {
      finalAns[i] = q.type === "integer" ? parseFloat(intInputs[i]) : answers[i];
    });
    sessionDel(draftKey);
    onSubmit({ answers: finalAns, qStatuses: qStatus, timeTaken: (test.durationMins || 180) * 60 - timeLeft });
  };

  // Count from answers/intInputs directly — fixes stale state issue
  const answeredCount = allQs.filter((q, i) => {
    const a = q.type === "integer" ? intInputs[i] : answers[i];
    return a !== undefined && a !== null && a !== "" && !(typeof a === "number" && isNaN(a));
  }).length;

  const counts = Object.values(qStatus).reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {});
  // Override answered count with the reliable direct calculation
  counts[Q_STATUS.ANS] = answeredCount;

  const timerC = timeLeft < 600 ? "#e53935" : timeLeft < 1800 ? "#ff9800" : "#27ae60";

  const subjectColor = { Physics: "#1a237e", Chemistry: "#1b5e20", Mathematics: "#4a148c" };
  const subjectBg = { Physics: "#e8eaf6", Chemistry: "#e8f5e9", Mathematics: "#f3e5f5" };

  return (
    <div style={{ height:"100vh", background:"#f0f2f5", fontFamily:"Arial, sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* ── Top Header — NTA Style ── */}
      <div style={{ background:"#1a237e", color:"white", flexShrink:0, borderBottom:"3px solid #ffca28" }}>
        <div style={{ display:"flex", alignItems:"center", padding:"0 16px", height:52 }}>
          {/* Left: NTA Logo + Exam name */}
          <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:200 }}>
            <div style={{ background:"#ffca28", color:"#1a237e", fontWeight:900, fontSize:14, padding:"3px 10px", borderRadius:4, letterSpacing:1 }}>NTA</div>
            <div>
              <div style={{ fontWeight:800, fontSize:13, lineHeight:1.2 }}>JEE (Main)</div>
              <div style={{ fontSize:10, opacity:0.6 }}>National Testing Agency</div>
            </div>
          </div>
          {/* Center: Test title */}
          <div style={{ flex:1, textAlign:"center" }}>
            <div style={{ fontWeight:700, fontSize:14, opacity:0.95 }}>{test.title}</div>
          </div>
          {/* Right: Profile + Timer */}
          <div style={{ display:"flex", alignItems:"center", gap:16, minWidth:200, justifyContent:"flex-end" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"#ffca28", color:"#1a237e", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:13 }}>
                {student.name[0].toUpperCase()}
              </div>
              <div style={{ fontSize:12 }}>
                <div style={{ fontWeight:700 }}>{student.name}</div>
                <div style={{ opacity:0.6, fontSize:10 }}>Candidate</div>
              </div>
            </div>
            <div style={{ background: timeLeft < 600 ? "#b71c1c" : "#0a2472", borderRadius:6, padding:"6px 14px", fontWeight:900, fontSize:16, color: timerC, fontVariantNumeric:"tabular-nums", border:`1px solid ${timeLeft < 600 ? "#ef9a9a" : "rgba(255,255,255,0.3)"}`, textAlign:"center" }}>
              <div style={{ fontSize:9, opacity:0.7, fontWeight:400, marginBottom:1 }}>Time Left</div>
              {fmt(timeLeft)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Subject Tabs ── */}
      <div style={{ background:"#283593", display:"flex", borderBottom:"1px solid #1a237e", flexShrink:0 }}>
        {subjects.map(s => {
          const sQs = allQs.filter(q => q.subject === s);
          const ans = sQs.filter((q, _) => {
            const gi = allQs.indexOf(q);
            const a = q.type === "integer" ? intInputs[gi] : answers[gi];
            return a !== undefined && a !== null && a !== "";
          }).length;
          return (
            <button key={s} onClick={() => switchSubject(s)}
              style={{ padding:"10px 20px", border:"none", borderBottom: activeSub === s ? "3px solid #ffca28" : "3px solid transparent",
                fontWeight:700, fontSize:13, cursor:"pointer", transition:"all 0.15s",
                background: activeSub === s ? "rgba(255,255,255,0.15)" : "transparent",
                color: activeSub === s ? "white" : "rgba(255,255,255,0.6)" }}>
              {s}
              <span style={{ marginLeft:6, background: activeSub === s ? "#ffca28" : "rgba(255,255,255,0.2)", color: activeSub === s ? "#1a237e" : "white", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:800 }}>
                {ans}/{sQs.length}
              </span>
            </button>
          );
        })}
        <div style={{ flex:1 }} />
        <div style={{ padding:"0 16px", display:"flex", alignItems:"center", gap:16, fontSize:12, color:"rgba(255,255,255,0.7)" }}>
          <span>Total: <b style={{ color:"white" }}>{answeredCount}/{allQs.length}</b> answered</span>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ display:"flex", flex:1, minHeight:0 }}>

        {/* Question Panel */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Question number bar - NTA style */}
          <div style={{ background:"#e8eaf6", borderBottom:"2px solid #c5cae9", padding:"8px 16px", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <span style={{ fontWeight:800, color:"#1a237e", fontSize:13 }}>
              Question {subQs.findIndex(q => q.gi === curGi) + 1} of {subQs.length}
            </span>
            <span style={{ background: subjectColor[activeSub] || "#1a237e", color:"white", borderRadius:3, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
              {activeSub}
            </span>
            <span style={{ background: cur.type === "integer" ? "#fff8e1" : "#e3f2fd", color: cur.type === "integer" ? "#e65100" : "#1565c0", borderRadius:3, padding:"2px 10px", fontSize:11, fontWeight:700, border: cur.type === "integer" ? "1px solid #ffe082" : "1px solid #90caf9" }}>
              {cur.type === "integer" ? "🔢 Numerical Integer" : "🅐 Multiple Choice"}
            </span>
            <span style={{ marginLeft:"auto", background:"#1a237e", color:"white", borderRadius:4, padding:"3px 12px", fontSize:12, fontWeight:700 }}>
              +{Number(cur.marks)||4} / {Number(cur.negative)||-1}
            </span>
          </div>

          {/* Question body */}
          <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
            <div style={{ background:"white", borderRadius:8, border:"1px solid #e0e0e0", padding:"20px 24px", marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:15, lineHeight:2, color:"#212121", margin:0, fontFamily:"Georgia, serif" }}>
                {renderQuestionText(cur.text, false, cur.figurePageNumber)}
              </div>
            </div>

            {cur.type === "mcq" ? (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {cur.options.map((opt, oi) => {
                  const sel = answers[curGi] === oi;
                  return (
                    <div key={oi} onClick={() => setAnswers(p => ({ ...p, [curGi]: oi }))}
                      style={{ padding:"13px 18px", borderRadius:6, border: `2px solid ${sel ? "#1a237e" : "#ddd"}`,
                        background: sel ? "#e8eaf6" : "white", cursor:"pointer",
                        display:"flex", gap:14, alignItems:"center", transition:"all 0.1s",
                        boxShadow: sel ? "0 0 0 1px #1a237e" : "0 1px 2px rgba(0,0,0,0.04)" }}>
                      <div style={{ width:30, height:30, borderRadius:"50%",
                        background: sel ? "#1a237e" : "white", color: sel ? "white" : "#555",
                        border: `2px solid ${sel ? "#1a237e" : "#bbb"}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontWeight:800, fontSize:13, flexShrink:0 }}>
                        {["A","B","C","D"][oi]}
                      </div>
                      <span style={{ fontSize:14, color:"#212121", fontFamily:"Georgia, serif", lineHeight:1.6 }}>
                        {renderQuestionText(opt, true, cur.figurePageNumber)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background:"white", borderRadius:8, border:"1px solid #e0e0e0", padding:"20px 24px" }}>
                <div style={{ fontSize:13, color:"#1a237e", fontWeight:700, marginBottom:16 }}>
                  📝 Numerical Answer Type — Enter Integer Value:
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                  <input
                    type="number"
                    value={intInputs[curGi] !== undefined ? intInputs[curGi] : ""}
                    onChange={e => setIntInputs(p => ({ ...p, [curGi]: e.target.value }))}
                    onWheel={e => e.target.blur()}
                    placeholder="0"
                    style={{ padding:"16px 20px", borderRadius:6, border:"2px solid #1a237e", fontSize:28, fontWeight:700,
                      width:220, outline:"none", textAlign:"center", display:"block",
                      background:"#f8f9ff", boxSizing:"border-box", fontFamily:"Arial, sans-serif",
                      color:"#1a237e" }}
                  />
                  {intInputs[curGi] !== undefined && intInputs[curGi] !== "" && (
                    <div style={{ background:"#e8f5e9", border:"1px solid #a5d6a7", borderRadius:8, padding:"8px 16px", fontSize:14, color:"#2e7d32", fontWeight:700 }}>
                      ✅ Answer: {intInputs[curGi]}
                    </div>
                  )}
                </div>
                <div style={{ fontSize:12, color:"#888", marginTop:10 }}>
                  Enter integer only. Use CLEAR RESPONSE button to reset.
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ background:"#f5f5f5", borderTop:"1px solid #e0e0e0", padding:"10px 16px", flexShrink:0 }}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
              <button onClick={() => saveAndNext(false)}
                style={{ padding:"10px 18px", borderRadius:4, border:"none", background:"#2e7d32", color:"white", fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:0.5 }}>
                SAVE & NEXT
              </button>
              <button onClick={() => saveAndNext(true)}
                style={{ padding:"10px 18px", borderRadius:4, border:"none", background:"#f57f17", color:"white", fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:0.5 }}>
                SAVE & MARK FOR REVIEW
              </button>
              <button onClick={() => { setAnswers(p => { const n = { ...p }; delete n[curGi]; return n; }); setIntInputs(p => { const n = { ...p }; delete n[curGi]; return n; }); setQS(curGi, Q_STATUS.NA); }}
                style={{ padding:"10px 18px", borderRadius:4, border:"2px solid #757575", background:"white", color:"#424242", fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:0.5 }}>
                CLEAR RESPONSE
              </button>
              <button onClick={() => { setQS(curGi, Q_STATUS.MR); const next = subQs[subQs.findIndex(q => q.gi === curGi) + 1]; if (next) setGlobalIdx(next.gi); }}
                style={{ padding:"10px 18px", borderRadius:4, border:"none", background:"#6a1b9a", color:"white", fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:0.5 }}>
                MARK FOR REVIEW & NEXT
              </button>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <button
                onClick={() => {
                  const curPosInSub = subQs.findIndex(q => q.gi === curGi);
                  if (curPosInSub > 0) setGlobalIdx(subQs[curPosInSub - 1].gi);
                  else {
                    // Go to previous subject last question
                    const subIdx = subjects.indexOf(activeSub);
                    if (subIdx > 0) {
                      const prevSub = subjects[subIdx - 1];
                      const prevSubQs = allQs.map((q,gi)=>({...q,gi})).filter(q=>q.subject===prevSub);
                      if (prevSubQs.length > 0) { setActiveSub(prevSub); setGlobalIdx(prevSubQs[prevSubQs.length-1].gi); }
                    }
                  }
                }}
                style={{ padding:"9px 20px", borderRadius:4, border:"2px solid #bbb", background:"white", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                ← BACK
              </button>
              <button onClick={() => setConfirm(true)}
                style={{ padding:"9px 24px", borderRadius:4, border:"none", background:"#c62828", color:"white", fontWeight:800, fontSize:13, cursor:"pointer", letterSpacing:0.5 }}>
                SUBMIT TEST
              </button>
              <button
                onClick={() => {
                  const curPosInSub = subQs.findIndex(q => q.gi === curGi);
                  if (curPosInSub < subQs.length - 1) setGlobalIdx(subQs[curPosInSub + 1].gi);
                  else {
                    // Go to next subject first question
                    const subIdx = subjects.indexOf(activeSub);
                    if (subIdx < subjects.length - 1) {
                      const nextSub = subjects[subIdx + 1];
                      switchSubject(nextSub);
                    }
                  }
                }}
                style={{ padding:"9px 20px", borderRadius:4, border:"2px solid #bbb", background:"white", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                NEXT →
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar — Question Palette ── */}
        <div style={{ width:260, background:"white", borderLeft:"2px solid #e0e0e0", display:"flex", flexDirection:"column", flexShrink:0 }}>
          {/* Student info - NTA style with photo box */}
          <div style={{ background:"#1a237e", color:"white", padding:"10px 12px", borderBottom:"2px solid #ffca28", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:48, height:56, borderRadius:4, background:"#e8eaf6", border:"2px solid #ffca28", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
              <div style={{ fontWeight:900, fontSize:20, color:"#1a237e" }}>{student.name[0].toUpperCase()}</div>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:13 }}>{student.name}</div>
              <div style={{ fontSize:10, opacity:0.7, marginTop:1 }}>JEE Main — {test.title}</div>
              <div style={{ fontSize:10, opacity:0.6, marginTop:1 }}>Total: <b style={{ color:"#ffca28" }}>{answeredCount}/{allQs.length}</b> answered</div>
            </div>
          </div>

          {/* Legend - NTA exact style */}
          <div style={{ padding:"10px 12px", borderBottom:"1px solid #ddd", background:"#f5f5f5" }}>
            <div style={{ fontWeight:700, fontSize:11, color:"#333", marginBottom:8, letterSpacing:0.3 }}>Question Status</div>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {[
                { s:Q_STATUS.ANS, l:"Answered",           c:"#26a541", shape:"circle" },
                { s:Q_STATUS.NA,  l:"Not Answered",        c:"#c0392b", shape:"circle" },
                { s:Q_STATUS.MR,  l:"Marked for Review",   c:"#8b3fa8", shape:"circle" },
                { s:Q_STATUS.AMR, l:"Answered & Marked",   c:"#8b3fa8", shape:"circle" },
                { s:Q_STATUS.NV,  l:"Not Visited",         c:"#787878", shape:"circle" },
              ].map(({ s, l, c: col, shape }) => (
                <div key={s} style={{ display:"flex", alignItems:"center", gap:8, fontSize:11 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:col, color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, flexShrink:0 }}>
                    {counts[s] || 0}
                  </div>
                  <span style={{ color:"#333", fontSize:11 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Palette — one section at a time */}
          <div style={{ flex:1, overflowY:"auto", padding:"10px 14px" }}>
            <div style={{ fontWeight:700, fontSize:11, color:"#1a237e", marginBottom:8, textTransform:"uppercase", letterSpacing:0.5 }}>
              {activeSub} — Question Palette
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {subQs.map((q, localI) => {
                const isActive = q.gi === curGi;
                const st = qStatus[q.gi] || Q_STATUS.NV;
                // NTA: all palette items are circles
                return (
                  <div key={q.gi} onClick={() => setGlobalIdx(q.gi)}
                    style={{ width:34, height:34, borderRadius:"50%",
                      background: isActive ? "#1a237e" : Q_COLORS[st],
                      color:"white", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:800, cursor:"pointer",
                      border: isActive ? "3px solid #ffca28" : "2px solid rgba(0,0,0,0.1)",
                      boxShadow: isActive ? "0 0 0 2px #1a237e, 0 2px 4px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.15)",
                      transition:"all 0.1s" }}>
                    {localI + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit button in sidebar */}
          <div style={{ padding:"12px 14px", borderTop:"1px solid #eee" }}>
            <button onClick={() => setConfirm(true)}
              style={{ width:"100%", padding:"11px", borderRadius:4, border:"none", background:"#c62828", color:"white", fontWeight:800, fontSize:13, cursor:"pointer" }}>
              SUBMIT TEST
            </button>
          </div>
        </div>
      </div>

      {/* Submit confirmation modal */}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <div style={{ background:"white", borderRadius:12, padding:36, maxWidth:420, width:"90%", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
            <h2 style={{ margin:"0 0 8px", color:"#1a237e", fontSize:20 }}>Submit Test?</h2>
            <p style={{ color:"#666", margin:"0 0 6px", fontSize:14 }}>Answered: <b style={{ color:"#27ae60" }}>{answeredCount}</b> of <b>{allQs.length}</b> questions.</p>
            <p style={{ color:"#e53935", margin:"0 0 24px", fontSize:12 }}>This action cannot be undone.</p>
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={() => setConfirm(false)} style={{ padding:"12px 28px", borderRadius:6, border:"2px solid #bbb", background:"white", fontWeight:700, cursor:"pointer", fontSize:14 }}>Cancel</button>
              <button onClick={doSubmit} style={{ padding:"12px 28px", borderRadius:6, border:"none", background:"#c62828", color:"white", fontWeight:800, cursor:"pointer", fontSize:14 }}>Yes, Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   RESULTS SCREEN
───────────────────────────────────────────── */
function ResultsScreen({ test, student, submission, onBack }) {
  const qs = test.questions || DEMO_QUESTIONS;
  const { answers, timeTaken } = submission;
  const [tab, setTab] = useState("overview");
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState(false);

  const shareResult = () => {
    const url = buildResultUrl(test.id, student.name);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const results = qs.map((q,i)=>{
    const given = answers[i];
    const blank = given===undefined||given===null||given===""||( typeof given==="number"&&isNaN(given));
    const correct = !blank && String(given)===String(q.correct);
    const wrong = !blank && !correct;
    const qMarks = Number(q.marks)||4;
    const qNeg = (q.negative!==undefined&&q.negative!==null)?Number(q.negative):-1;
    return { ...q, marks:qMarks, negative:qNeg, given, isCorrect:correct, isWrong:wrong, isSkipped:blank, earned: correct?qMarks:wrong?qNeg:0 };
  });

  const maxMarks = results.reduce((s,r)=>s+r.marks,0);
  const scored = results.reduce((s,r)=>s+r.earned,0);
  const nCorrect = results.filter(r=>r.isCorrect).length;
  const nWrong = results.filter(r=>r.isWrong).length;
  const nSkip = results.filter(r=>r.isSkipped).length;
  const pct = maxMarks>0 ? Math.max(0,Math.round((scored/maxMarks)*100)) : 0;
  const grade = pct>=85?"A+":pct>=70?"A":pct>=55?"B":pct>=40?"C":"D";
  const gradeC = pct>=70?"#2e7d32":pct>=40?"#f57c00":"#e53935";

  const bySub = {};
  results.forEach(r=>{ if(!bySub[r.subject]) bySub[r.subject]={c:0,w:0,s:0,marks:0,max:0}; const b=bySub[r.subject]; if(r.isCorrect)b.c++;else if(r.isWrong)b.w++;else b.s++; b.marks+=r.earned; b.max+=r.marks; });

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fb", fontFamily:"Georgia, serif" }}>
      <div style={{ background:"linear-gradient(135deg,#1a1a2e,#283593)", color:"white", padding:"28px 24px" }}>
        <div style={{ maxWidth:880, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:22, marginBottom:4 }}>📊 Test Results</div>
              <div style={{ opacity:0.6, fontSize:13 }}>{test.title} — {student.name} — Time: {fmt(timeTaken)}</div>
            </div>
            <button onClick={shareResult}
              style={{ padding:"11px 20px", borderRadius:12, border: copied ? "1px solid #66bb6a" : "1px solid rgba(255,255,255,0.25)",
                background: copied ? "rgba(67,160,71,0.3)" : "rgba(255,255,255,0.15)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13 }}>
              {copied ? "Result Link Copied!" : "Share My Result"}
            </button>
          </div>
          <div style={{ display:"flex", gap:16, marginTop:20, flexWrap:"wrap" }}>
            {[{l:"Score",v:`${scored}/${maxMarks}`,c:gradeC},{l:"Percentage",v:`${pct}%`,c:gradeC},{l:"Grade",v:grade,c:gradeC},{l:"Correct",v:nCorrect,c:"#80deea"},{l:"Wrong",v:nWrong,c:"#ef9a9a"},{l:"Skipped",v:nSkip,c:"#fff9c4"}].map(({l,v,c})=>(
              <div key={l} style={{ background:"rgba(255,255,255,0.1)", borderRadius:12, padding:"14px 20px", textAlign:"center", minWidth:80 }}>
                <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:880, margin:"0 auto", padding:24 }}>
        <div style={{ display:"flex", gap:4, marginBottom:22, background:"white", borderRadius:12, padding:5, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          {[["overview","Overview"],["subject","By Subject"],["solutions","Solutions"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:tab===t?"#1a237e":"transparent", color:tab===t?"white":"#555", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
          ))}
        </div>

        {tab==="overview" && (
          <div style={{ background:"white", borderRadius:16, padding:24, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin:"0 0 18px", color:"#1a237e", fontSize:16 }}>Score Breakdown</h3>
            {[{l:"Correct",v:nCorrect,col:"#43a047"},{l:"Wrong",v:nWrong,col:"#e53935"},{l:"Skipped",v:nSkip,col:"#9e9e9e"}].map(({l,v,col})=>(
              <div key={l} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                  <span style={{ fontWeight:600 }}>{l}</span><span style={{ color:col, fontWeight:700 }}>{v}/{qs.length}</span>
                </div>
                <div style={{ height:10, background:"#f0f0f0", borderRadius:5, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${(v/qs.length)*100}%`, background:col, borderRadius:5 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==="subject" && Object.entries(bySub).map(([sub,d])=>{
          const pct2 = Math.max(0,Math.round((d.marks/d.max)*100));
          const cols = {Physics:{bg:"#1e3a5f",acc:"#4fc3f7"},Chemistry:{bg:"#1b4332",acc:"#69f0ae"},Mathematics:{bg:"#4a1942",acc:"#f48fb1"}};
          const c = cols[sub]||{bg:"#1a237e",acc:"#e8c97e"};
          return (
            <div key={sub} style={{ background:"white", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", marginBottom:14 }}>
              <div style={{ background:c.bg, color:"white", padding:"16px 24px", display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontWeight:700, fontSize:16 }}>{sub}</span>
                <span style={{ fontWeight:800, fontSize:20, color:c.acc }}>{d.marks}/{d.max}</span>
              </div>
              <div style={{ padding:20 }}>
                <div style={{ height:8, background:"#f0f0f0", borderRadius:4, marginBottom:16, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct2}%`, background:c.acc, borderRadius:4 }} />
                </div>
                <div style={{ display:"flex", gap:20 }}>
                  {[["✅",d.c,"#43a047","Correct"],["❌",d.w,"#e53935","Wrong"],["⬜",d.s,"#9e9e9e","Skipped"]].map(([ic,n,col,l])=>(
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:col }}>{n}</div>
                      <div style={{ fontSize:12, color:"#888" }}>{ic} {l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {tab==="solutions" && results.map((r,i)=>{
          const bg = r.isCorrect?"#e8f5e9":r.isWrong?"#ffebee":"#f9f9f9";
          const border = r.isCorrect?"#a5d6a7":r.isWrong?"#ef9a9a":"#e0e0e0";
          return (
            <div key={i} style={{ background:bg, border:`1px solid ${border}`, borderRadius:12, overflow:"hidden", marginBottom:10 }}>
              <div onClick={()=>setExpanded(expanded===i?null:i)} style={{ padding:"13px 18px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:600, fontSize:13 }}>{r.isCorrect?"✅":r.isWrong?"❌":"⬜"} Q{i+1}. <span style={{ fontWeight:400, color:"#555" }}>{r.text.slice(0,55)}...</span></span>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontWeight:800, fontSize:13, color:r.earned>0?"#2e7d32":r.earned<0?"#c62828":"#888" }}>{r.earned>0?"+":""}{r.earned}</span>
                  <span style={{ color:"#bbb" }}>{expanded===i?"▲":"▼"}</span>
                </div>
              </div>
              {expanded===i && (
                <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${border}` }}>
                  <div style={{ margin:"12px 0 14px", fontSize:13, lineHeight:1.75 }}>{renderQuestionText(r.text, false, r.figurePageNumber)}</div>
                  {r.type==="mcq" ? r.options.map((opt,oi)=>(
                    <div key={oi} style={{ padding:"8px 12px", borderRadius:8, marginBottom:6, fontSize:13,
                      background:String(r.correct)===String(oi)?"#c8e6c9":String(r.given)===String(oi)?"#ffcdd2":"white",
                      border:`1px solid ${String(r.correct)===String(oi)?"#81c784":"#e0e0e0"}`,
                      fontWeight:String(r.correct)===String(oi)?700:400 }}>
                      {["A","B","C","D"][oi]}) {renderQuestionText(opt, true, r.figurePageNumber)}
                      {String(r.correct)===String(oi)&&" ✅ Correct Answer"}
                      {String(r.given)===String(oi)&&String(r.given)!==String(r.correct)&&" ← Your Answer"}
                    </div>
                  )) : (
                    <div style={{ fontSize:14 }}>
                      <div>Your answer: <b>{r.given??"-"}</b></div>
                      <div>Correct: <b style={{ color:"#2e7d32" }}>{r.correct}</b></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <button onClick={onBack} style={{ marginTop:22, padding:"13px 32px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1a1a2e,#3949ab)", color:"white", fontWeight:800, fontSize:15, cursor:"pointer", display:"block", width:"100%", fontFamily:"inherit" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SHARED RESULT SCREEN  (public view via link)
───────────────────────────────────────────── */
function SharedResultScreen({ data }) {
  if (!data) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia, serif", color:"#888" }}>Loading...</div>;

  if (data.error) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia, serif", background:"#f4f6fb" }}>
      <div style={{ textAlign:"center", padding:40 }}>
        <div style={{ fontSize:60, marginBottom:16 }}>🔍</div>
        <div style={{ fontSize:20, fontWeight:700, color:"#1a1a2e", marginBottom:8 }}>Result Not Found</div>
        <div style={{ color:"#888", fontSize:14 }}>{data.error}</div>
        <button onClick={()=>window.location.href=window.location.pathname} style={{ marginTop:24, padding:"12px 28px", borderRadius:12, border:"none", background:"#1a237e", color:"white", fontWeight:700, cursor:"pointer", fontSize:14 }}>Go to Home</button>
      </div>
    </div>
  );

  const { test, submission, studentName } = data;
  const qs = test.questions || DEMO_QUESTIONS;
  const { answers, timeTaken } = submission;

  const results = qs.map((q,i)=>{
    const given = answers[i];
    const blank = given===undefined||given===null||given===""||( typeof given==="number"&&isNaN(given));
    const correct = !blank && String(given)===String(q.correct);
    const wrong = !blank && !correct;
    const qMarks = Number(q.marks)||4;
    const qNeg = (q.negative!==undefined&&q.negative!==null)?Number(q.negative):-1;
    return { ...q, marks:qMarks, negative:qNeg, given, isCorrect:correct, isWrong:wrong, isSkipped:blank, earned: correct?qMarks:wrong?qNeg:0 };
  });

  const maxMarks = results.reduce((s,r)=>s+r.marks,0);
  const scored = results.reduce((s,r)=>s+r.earned,0);
  const nCorrect = results.filter(r=>r.isCorrect).length;
  const nWrong = results.filter(r=>r.isWrong).length;
  const nSkip = results.filter(r=>r.isSkipped).length;
  const pct = maxMarks>0 ? Math.max(0,Math.round((scored/maxMarks)*100)) : 0;
  const grade = pct>=85?"A+":pct>=70?"A":pct>=55?"B":pct>=40?"C":"D";
  const gradeC = pct>=70?"#2e7d32":pct>=40?"#f57c00":"#e53935";

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fb", fontFamily:"Georgia, serif" }}>
      <div style={{ background:"linear-gradient(135deg,#1a1a2e,#283593)", color:"white", padding:"28px 24px" }}>
        <div style={{ maxWidth:700, margin:"0 auto" }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginBottom:6 }}>🎯 TestForge — Shared Result</div>
          <div style={{ fontWeight:800, fontSize:24, marginBottom:4 }}>{studentName}'s Result</div>
          <div style={{ opacity:0.6, fontSize:13 }}>{test.title} — Time: {fmt(timeTaken)}</div>
          <div style={{ display:"flex", gap:14, marginTop:20, flexWrap:"wrap" }}>
            {[{l:"Score",v:`${scored}/${maxMarks}`,c:gradeC},{l:"Percentage",v:`${pct}%`,c:gradeC},{l:"Grade",v:grade,c:gradeC},{l:"Correct",v:nCorrect,c:"#80deea"},{l:"Wrong",v:nWrong,c:"#ef9a9a"},{l:"Skipped",v:nSkip,c:"#fff9c4"}].map(({l,v,c})=>(
              <div key={l} style={{ background:"rgba(255,255,255,0.1)", borderRadius:12, padding:"14px 20px", textAlign:"center", minWidth:72 }}>
                <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth:700, margin:"0 auto", padding:24 }}>
        <div style={{ background:"white", borderRadius:16, padding:24, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin:"0 0 18px", color:"#1a237e", fontSize:16 }}>Performance Breakdown</h3>
          {[{l:"Correct",v:nCorrect,col:"#43a047"},{l:"Wrong",v:nWrong,col:"#e53935"},{l:"Skipped",v:nSkip,col:"#9e9e9e"}].map(({l,v,col})=>(
            <div key={l} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                <span style={{ fontWeight:600 }}>{l}</span><span style={{ color:col, fontWeight:700 }}>{v}/{qs.length}</span>
              </div>
              <div style={{ height:10, background:"#f0f0f0", borderRadius:5, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${(v/qs.length)*100}%`, background:col, borderRadius:5 }} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={()=>window.location.href=window.location.pathname}
          style={{ marginTop:20, padding:"13px 32px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1a1a2e,#3949ab)", color:"white", fontWeight:800, fontSize:14, cursor:"pointer", display:"block", width:"100%", fontFamily:"inherit" }}>
          Try TestForge
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SMALL HELPERS
───────────────────────────────────────────── */
function Label({ children }) {
  return <label style={{ color:"#555", fontSize:12, fontWeight:700, letterSpacing:0.5, display:"block", marginBottom:7, textTransform:"uppercase" }}>{children}</label>;
}
function Input({ value, onChange, placeholder, type="text" }) {
  return (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%", padding:"11px 13px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", background:"#fafafa", boxSizing:"border-box", fontFamily:"inherit" }} />
  );
}
function Btn({ children, onClick, color, outline }) {
  return (
    <button onClick={onClick} style={{ padding:"10px 18px", borderRadius:9, border:outline?`2px solid ${color}`:"none",
      background:outline?"white":color, color:outline?color:"white", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"Segoe UI, sans-serif" }}>
      {children}
    </button>
  );
}
