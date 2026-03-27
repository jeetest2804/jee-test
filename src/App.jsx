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
function PageImageFigure({ imageData, pageNumber, compact, label }) {
  // imageData is a base64 PNG already embedded in the question object at creation time
  // pageNumber is kept as fallback label only
  const w = compact ? 260 : 420;

  if (!imageData) {
    // No image data — show a clean placeholder
    return (
      <div style={{
        border: "1.5px dashed #bbb", borderRadius: compact ? 6 : 8,
        display: "inline-block", padding: compact ? "8px 14px" : "12px 20px",
        color: "#999", fontSize: compact ? 10 : 12, fontStyle: "italic",
        background: "#fafafa", verticalAlign: "top",
      }}>
        📊 Figure{pageNumber ? ` (page ${pageNumber})` : ""}
      </div>
    );
  }

  return (
    <div style={{
      border: "2px solid #1a237e", borderRadius: compact ? 6 : 8,
      overflow: "hidden", background: "white",
      display: "inline-block", maxWidth: "100%", verticalAlign: "top",
      boxShadow: "0 2px 8px rgba(26,35,126,0.12)",
    }}>
      <img
        src={`data:image/png;base64,${imageData}`}
        alt={label || "Figure"}
        style={{ maxWidth: w, width: "100%", height: "auto", display: "block" }}
      />
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

// Render question text: supports [FIGURE], [FIGURE_A/B/C/D], and legacy [FIGURE: desc]
function renderQuestionText(text, compact, figurePageNumber, figureImageData) {
  if (!text) return null;
  const parts = text.split(/(\[FIGURE(?:_[ABCD])?\]|\[FIGURE:[^\]]+\])/gi);
  return parts.map((part, i) => {
    if (/^\[FIGURE\]$/i.test(part)) {
      return <PageImageFigure key={i} imageData={figureImageData} pageNumber={figurePageNumber} compact={compact} label="Figure" />;
    }
    const optMatch = part.match(/^\[FIGURE_([ABCD])\]$/i);
    if (optMatch) {
      return <PageImageFigure key={i} imageData={figureImageData} pageNumber={figurePageNumber} compact={compact} label={`Option ${optMatch[1]}`} />;
    }
    const legacyMatch = part.match(/^\[FIGURE:\s*(.*?)\s*\]$/is);
    if (legacyMatch) {
      return <FigureBox key={i} desc={legacyMatch[1].trim()} compact={compact} />;
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


/* ═══════════════════════════════════════════════════════════════
   DESIGN SYSTEM — SaaS-grade, clean & premium
   Fonts: DM Sans (UI) + Space Grotesk (headings)
   Colors: Indigo primary, neutral grays, white surfaces
═══════════════════════════════════════════════════════════════ */
const DS = {
  // Colors
  primary:     "#4f46e5",
  primaryDark: "#4338ca",
  primaryLight:"#eef2ff",
  primaryMid:  "#6366f1",
  accent:      "#f59e0b",
  accentLight: "#fef3c7",
  success:     "#10b981",
  successLight:"#d1fae5",
  danger:      "#ef4444",
  dangerLight: "#fee2e2",
  warning:     "#f59e0b",
  warningLight:"#fef3c7",
  text:        "#111827",
  textMid:     "#374151",
  textSub:     "#6b7280",
  textMuted:   "#9ca3af",
  border:      "#e5e7eb",
  borderFocus: "#6366f1",
  bg:          "#f9fafb",
  surface:     "#ffffff",
  navBg:       "#0f172a",
  // Shadows
  shadow:      "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:    "0 4px 12px rgba(0,0,0,0.08)",
  shadowLg:    "0 8px 30px rgba(0,0,0,0.12)",
  // Radii
  r:           "10px",
  rLg:         "14px",
  rXl:         "18px",
};

/* ── SHARED FONT IMPORT ── */
const FontImport = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'DM Sans', sans-serif; }
    input::placeholder { color: #9ca3af; }
    input:focus { outline: none; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important; }
    button { transition: all 0.15s; }
    button:hover:not(:disabled) { filter: brightness(1.06); }
    button:active:not(:disabled) { transform: scale(0.98); }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
  `}</style>
);

/* ── TOP NAV BAR ── */
function TopNav({ logo="TestForge", subtitle, user, navItems=[], activeView, onNav, onLogout, actions }) {
  return (
    <div style={{ background:DS.navBg, height:56, display:"flex", alignItems:"center", paddingLeft:24, paddingRight:24, gap:0, position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 0 rgba(255,255,255,0.06)" }}>
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:32 }}>
        <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🎯</div>
        <div>
          <div style={{ color:"white", fontWeight:700, fontSize:15, fontFamily:"'Space Grotesk', sans-serif", letterSpacing:-0.3 }}>{logo}</div>
          {subtitle && <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10, letterSpacing:1, textTransform:"uppercase", marginTop:-1 }}>{subtitle}</div>}
        </div>
      </div>

      {/* Nav items */}
      <div style={{ display:"flex", gap:2, flex:1 }}>
        {navItems.map(([v, label, icon]) => (
          <button key={v} onClick={() => onNav(v)}
            style={{ padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontSize:13, fontWeight:500,
              background: activeView===v ? "rgba(99,102,241,0.18)" : "transparent",
              color: activeView===v ? "#a5b4fc" : "rgba(255,255,255,0.55)" }}>
            {icon && <span style={{ marginRight:5 }}>{icon}</span>}{label}
          </button>
        ))}
      </div>

      {/* Right side */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {actions}
        {user && (
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"white", fontWeight:700 }}>
                {(user.name||"?")[0].toUpperCase()}
              </div>
              <span style={{ color:"rgba(255,255,255,0.7)", fontSize:13 }}>{user.name}</span>
            </div>
            <button onClick={onLogout}
              style={{ padding:"6px 14px", borderRadius:7, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"rgba(255,255,255,0.45)", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── STATUS BADGE ── */
function StatusBadge({ status }) {
  const cfg = {
    live:      { bg:"#dcfce7", color:"#15803d", dot:"#22c55e", label:"Live" },
    scheduled: { bg:"#fef3c7", color:"#b45309", dot:"#f59e0b", label:"Scheduled" },
    ended:     { bg:"#f3f4f6", color:"#6b7280", dot:"#9ca3af", label:"Ended" },
  };
  const c = cfg[status] || cfg.ended;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:99, background:c.bg, color:c.color, fontSize:12, fontWeight:600 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:c.dot, display:"inline-block" }} />
      {c.label}
    </span>
  );
}

/* ── SERVER WARN BANNER ── */
function ServerWarnBanner() {
  return (
    <div style={{ background:"linear-gradient(90deg,#f59e0b,#f97316)", color:"white", padding:"10px 24px", display:"flex", alignItems:"center", justifyContent:"center", gap:12, fontSize:13, fontWeight:600 }}>
      <span>⏳</span>
      <span>Server is waking up (cold start) — please wait 30–60 seconds, then refresh.</span>
      <button onClick={()=>window.location.reload()}
        style={{ padding:"4px 14px", borderRadius:6, border:"none", background:"rgba(255,255,255,0.25)", color:"white", fontWeight:700, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
        Refresh
      </button>
    </div>
  );
}

/* ── STAT CARD ── */
function StatCard({ label, value, icon, color }) {
  return (
    <div style={{ background:DS.surface, borderRadius:DS.rLg, padding:"20px 22px", boxShadow:DS.shadow, border:`1px solid ${DS.border}`, display:"flex", alignItems:"flex-start", gap:14, flex:"1 1 140px" }}>
      <div style={{ width:40, height:40, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:26, fontWeight:700, color:DS.text, lineHeight:1, fontFamily:"'Space Grotesk', sans-serif" }}>{value}</div>
        <div style={{ fontSize:12, color:DS.textSub, marginTop:3 }}>{label}</div>
      </div>
    </div>
  );
}

/* ── ALERT BANNER ── */
function AlertBanner({ msg, type }) {
  if (!msg) return null;
  const cfg = {
    info:    { bg:"#eff6ff", color:"#1d4ed8", border:"#bfdbfe" },
    success: { bg:"#f0fdf4", color:"#15803d", border:"#bbf7d0" },
    warning: { bg:"#fffbeb", color:"#b45309", border:"#fde68a" },
    error:   { bg:"#fef2f2", color:"#b91c1c", border:"#fecaca" },
  };
  const c = cfg[type] || cfg.info;
  return (
    <div style={{ padding:"11px 16px", borderRadius:DS.r, background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontSize:13, fontWeight:500 }}>
      {msg}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   LOGIN SCREEN
════════════════════════════════════════════════════ */
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
        setLoading(false); return;
      }
      const match = studentPasswords.find(sp => sp.username.trim().toLowerCase() === name.trim().toLowerCase());
      if (!match) { setErr("Username not found. Contact your admin."); setLoading(false); return; }
      if (match.password !== pass) { setErr("Wrong password. Please try again."); setLoading(false); return; }
      onLogin(tab, match.name);
    } else {
      if (pass !== "admin123") { setErr("Wrong password."); setLoading(false); return; }
      onLogin(tab, name.trim());
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0f172a", display:"flex", fontFamily:"'DM Sans', sans-serif",
      backgroundImage:"radial-gradient(ellipse 80% 60% at 50% -20%, rgba(99,102,241,0.25) 0%, transparent 70%)" }}>
      <FontImport />

      {/* Left brand panel */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"60px 80px", maxWidth:520, borderRight:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:60 }}>
          <div style={{ width:36, height:36, borderRadius:9, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🎯</div>
          <span style={{ color:"white", fontWeight:700, fontSize:20, fontFamily:"'Space Grotesk', sans-serif" }}>TestForge</span>
        </div>

        <div style={{ color:"white", fontSize:36, fontWeight:700, fontFamily:"'Space Grotesk', sans-serif", lineHeight:1.2, marginBottom:20 }}>
          The modern<br/>
          <span style={{ background:"linear-gradient(90deg,#818cf8,#c084fc)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>JEE exam platform</span>
        </div>
        <div style={{ color:"rgba(255,255,255,0.45)", fontSize:15, lineHeight:1.7, maxWidth:340 }}>
          AI-powered question extraction, real-time test management, and detailed analytics for serious JEE prep.
        </div>

        <div style={{ marginTop:48, display:"flex", flexDirection:"column", gap:16 }}>
          {[
            ["⚡", "AI extracts questions from any JEE PDF"],
            ["📊", "Live leaderboards and detailed analytics"],
            ["🔒", "Role-based access for admins & students"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{icon}</div>
              <span style={{ color:"rgba(255,255,255,0.55)", fontSize:13 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          {linkedTest && (
            <div style={{ background:"rgba(99,102,241,0.12)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:DS.rLg, padding:"14px 18px", marginBottom:24, textAlign:"center" }}>
              <div style={{ color:"#a5b4fc", fontWeight:600, fontSize:12, letterSpacing:0.5, textTransform:"uppercase", marginBottom:4 }}>You're joining a test</div>
              <div style={{ color:"white", fontWeight:700, fontSize:16 }}>{linkedTest.title}</div>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:12, marginTop:4 }}>{linkedTest.durationMins} min · {linkedTest.questions?.length||0} Questions</div>
            </div>
          )}

          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:DS.rXl, padding:"32px 32px", backdropFilter:"blur(20px)" }}>
            <div style={{ marginBottom:24 }}>
              <div style={{ color:"white", fontWeight:700, fontSize:22, fontFamily:"'Space Grotesk', sans-serif", marginBottom:4 }}>Sign in</div>
              <div style={{ color:"rgba(255,255,255,0.35)", fontSize:13 }}>Choose your role and continue</div>
            </div>

            {/* Role tabs */}
            <div style={{ display:"flex", gap:4, marginBottom:24, background:"rgba(0,0,0,0.3)", borderRadius:9, padding:4 }}>
              {[["student","Student"],["teacher","Teacher"],["admin","Admin"]].map(([r,label]) => (
                <button key={r} onClick={() => { setTab(r); setErr(""); }}
                  style={{ flex:1, padding:"8px 4px", borderRadius:6, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
                    background: tab===r ? "rgba(99,102,241,0.9)" : "transparent",
                    color: tab===r ? "white" : "rgba(255,255,255,0.4)" }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontWeight:600, letterSpacing:0.8, display:"block", marginBottom:7, textTransform:"uppercase" }}>
                  {tab === "student" ? "Username" : "Name"}
                </label>
                <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}
                  placeholder={tab === "student" ? "Your username" : "Your name"}
                  style={{ width:"100%", padding:"11px 14px", borderRadius:9, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.06)", color:"white", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", transition:"border-color 0.15s" }}
                  onFocus={e=>e.target.style.borderColor="rgba(99,102,241,0.6)"}
                  onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"} />
              </div>
              <div>
                <label style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontWeight:600, letterSpacing:0.8, display:"block", marginBottom:7, textTransform:"uppercase" }}>Password</label>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}
                  placeholder="••••••••"
                  style={{ width:"100%", padding:"11px 14px", borderRadius:9, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.06)", color:"white", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", transition:"border-color 0.15s" }}
                  onFocus={e=>e.target.style.borderColor="rgba(99,102,241,0.6)"}
                  onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"} />
              </div>

              {err && (
                <div style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"9px 13px", color:"#fca5a5", fontSize:13 }}>
                  {err}
                </div>
              )}

              <button onClick={handle} disabled={loading}
                style={{ padding:"13px", borderRadius:9, border:"none", background:loading?"rgba(99,102,241,0.4)":"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"white", fontSize:14, fontWeight:700, cursor:loading?"default":"pointer", fontFamily:"inherit", marginTop:4, letterSpacing:0.2, opacity:loading?0.8:1 }}>
                {loading ? "Verifying..." : "Continue →"}
              </button>
            </div>
          </div>

          <div style={{ textAlign:"center", marginTop:20, color:"rgba(255,255,255,0.2)", fontSize:12 }}>
            Admin default password: <span style={{ fontFamily:"monospace" }}>admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   ADMIN SCREEN
════════════════════════════════════════════════════ */
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

  const DEFAULT_SECTIONS = [
    { subject: "Physics",     file: null, mcq: 20, integer: 5, enabled: true },
    { subject: "Chemistry",   file: null, mcq: 20, integer: 5, enabled: true },
    { subject: "Mathematics", file: null, mcq: 20, integer: 5, enabled: true },
  ];
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [uploadMode, setUploadMode] = useState("combined");
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


/* ─────────────────────────────────────────────
   EMBED FIGURE IMAGES INTO QUESTIONS
   Called after questions are extracted.
   For every question with hasFigure=true, fetches the PDF page image
   from the server and stores it as figureImageData (base64 PNG) directly
   in the question object. This way images are always available.
───────────────────────────────────────────── */
async function embedFigureImages(questions, pdfBase64, onProgress) {
  const questionsNeedingDetection = questions.filter(
    q => q.hasFigure && q.figurePageNumber && !q.figureRegion
  );

  if (questionsNeedingDetection.length > 0) {
    const pageCache = {};
    const uniquePages = [...new Set(questionsNeedingDetection.map(q => q.figurePageNumber))];

    await Promise.all(uniquePages.map(async page => {
      try {
        const res = await fetch("/api/page-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64: pdfBase64, page, cropRegion: null }),
        });
        const data = await res.json();
        if (data.ok && data.image) pageCache[page] = data.image;
      } catch {}
    }));

    await Promise.all(questionsNeedingDetection.map(async q => {
      const fullPageImage = pageCache[q.figurePageNumber];
      if (!fullPageImage) return;
      try {
        const hint = q.text ? q.text.replace(/\[FIGURE[^\]]*\]/g, "").trim().slice(0, 120) : "";
        const res = await fetch("/api/detect-figure-region", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageImageBase64: fullPageImage, questionHint: hint }),
        });
        const data = await res.json();
        if (data.ok && data.region) {
          q.figureRegion = data.region;
        }
      } catch {}
    }));
  }

  const CENTER_STRIP = { top: 15, bottom: 85, left: 0, right: 100 };
  const jobMap = {};
  questions.forEach(q => {
    if (!q.hasFigure || !q.figurePageNumber) return;
    const r = q.figureRegion || CENTER_STRIP;
    const key = `${q.figurePageNumber}:${r.top}:${r.bottom}:${r.left ?? 0}:${r.right ?? 100}`;
    if (!jobMap[key]) jobMap[key] = { page: q.figurePageNumber, cropRegion: r };
  });

  const jobs = Object.entries(jobMap);
  if (jobs.length === 0) return questions;

  const imageCache = {};
  let done = 0;
  const BATCH = 5;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([key, { page, cropRegion }]) => {
      try {
        const res = await fetch("/api/page-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64: pdfBase64, page, cropRegion }),
        });
        const data = await res.json();
        if (data.ok && data.image) imageCache[key] = data.image;
      } catch {}
      done++;
      if (onProgress) onProgress(done, jobs.length);
    }));
  }

  return questions.map(q => {
    if (!q.hasFigure || !q.figurePageNumber) return q;
    const r = q.figureRegion || CENTER_STRIP;
    const key = `${q.figurePageNumber}:${r.top}:${r.bottom}:${r.left ?? 0}:${r.right ?? 100}`;
    if (imageCache[key]) return { ...q, figureImageData: imageCache[key] };
    return q;
  });
}

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
              window.__pdfBase64 = b64;
              const res = await parsePDF(b64, false, savedModel);
              if (res?.questions?.length) {
                const normalized = normalizeQs(res.questions).map(q => ({ ...q, subject: sec.subject, id: globalId++ }));
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
          if (allQs.length === 0) { setMsg("❌ No questions extracted from any section.", "error"); setLoading(false); return; }
          questions = allQs;
          geminiUsed = true;
          setMsg(`✅ All sections done! Now loading diagrams...`, "info");
          if (window.__pdfBase64) {
            questions = await embedFigureImages(questions, window.__pdfBase64, (done, total) => {
              setMsg(`🖼️ Loading diagram images... (${done}/${total})`, "info");
            });
          }
          setMsg(`✅ All sections done! Total: ${questions.length} questions`, "success");
        } else if (paperFile) {
          setMsg("📄 Converting PDF to base64...", "info");
          const b64 = await toBase64(paperFile);
          window.__pdfBase64 = b64;
          setMsg("🤖 Extracting all subjects in parallel... Please wait up to 90s", "info");
          try {
            const res = await parsePDF(b64, false, savedModel);
            if (res?.questions?.length) {
              questions = normalizeQs(res.questions);
              geminiUsed = true;
              const warnMsg = res.warning ? ` ⚠️ Warning: ${res.warning}` : "";
              setMsg(`✅ Extracted ${questions.length} questions! Now loading diagrams...`, "info");
              questions = await embedFigureImages(questions, b64, (done, total) => {
                setMsg(`🖼️ Loading diagram images... (${done}/${total})`, "info");
              });
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
          setLoading(false); return;
        }
        setMsg("📁 Fetching from Google Drive...", "info");
        const paperB64 = await fetchDriveFile(form.drivePaperFileId, form.driveApiKey);
        window.__pdfBase64 = paperB64;
        setMsg("🤖 Extracting questions in parallel (Physics + Chemistry + Maths)... Please wait up to 90s", "info");
        try {
          const parsed = await parsePDF(paperB64, false, savedModel);
          if (parsed?.questions?.length) {
            questions = parsed.questions.map((q, idx) => {
              let type = q.type;
              if (!q.options || q.options.length === 0) type = "integer";
              if (q.options && q.options.length > 0) type = "mcq";
              return { ...q, id: q.id || (idx + 1), type, options: type === "mcq" ? (q.options || []) : [], marks: Number(q.marks) || 4, negative: q.negative !== undefined ? Number(q.negative) : (type === "mcq" ? -1 : 0) };
            });
            geminiUsed = true;
            setMsg(`✅ Extracted ${questions.length} questions! Now loading diagrams...`, "info");
            questions = await embedFigureImages(questions, paperB64, (done, total) => {
              setMsg(`🖼️ Loading diagram images... (${done}/${total})`, "info");
            });
          } else {
            setMsg("❌ Gemini returned 0 questions.", "error");
            setLoading(false); return;
          }
        } catch (err) {
          setMsg(`❌ Gemini failed: ${err.message}`, "error");
          setLoading(false); return;
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
        questions = DEMO_QUESTIONS;
      }
    } catch (e) {
      setMsg("Unexpected error: " + e.message, "error");
      setLoading(false); return;
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

  const navItems = [
    ["dashboard", "Dashboard", ""],
    ["create", "New Test", ""],
    ["students", "Students", ""],
    ["results", "Results", ""],
    ["settings", "Settings", ""],
  ];

  return (
    <div style={{ minHeight:"100vh", background:DS.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <FontImport />
      {!serverReady && <ServerWarnBanner />}
      <TopNav
        subtitle="Admin"
        user={user}
        navItems={navItems}
        activeView={view}
        onNav={setView}
        onLogout={onLogout}
      />

      <div style={{ maxWidth:960, margin:"0 auto", padding:"32px 24px" }}>

        {/* ── DASHBOARD ── */}
        {view === "dashboard" && (
          <>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Dashboard</h1>
              <p style={{ margin:"4px 0 0", color:DS.textSub, fontSize:14 }}>Overview of all your tests and students</p>
            </div>

            {/* Stats row */}
            <div style={{ display:"flex", gap:14, marginBottom:28, flexWrap:"wrap" }}>
              <StatCard label="Total Tests" value={tests.length} icon="📝" color="#4f46e5" />
              <StatCard label="Live Now" value={tests.filter(t=>getTestStatus(t)===TEST_STATUS.LIVE).length} icon="🔴" color="#ef4444" />
              <StatCard label="Scheduled" value={tests.filter(t=>getTestStatus(t)===TEST_STATUS.SCHEDULED).length} icon="📅" color="#f59e0b" />
              <StatCard label="Completed" value={tests.filter(t=>getTestStatus(t)===TEST_STATUS.ENDED).length} icon="✅" color="#10b981" />
              <StatCard label="Students" value={studentPasswords.length} icon="👨‍🎓" color="#8b5cf6" />
            </div>

            {/* Tests table */}
            <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, overflow:"hidden" }}>
              <div style={{ padding:"18px 24px", borderBottom:`1px solid ${DS.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>All Tests</h2>
                  <p style={{ margin:"2px 0 0", fontSize:12, color:DS.textSub }}>{tests.length} total</p>
                </div>
                <button onClick={()=>setView("create")}
                  style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
                  + New Test
                </button>
              </div>
              {tests.length === 0 ? (
                <div style={{ padding:"64px 0", textAlign:"center", color:DS.textMuted }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <div style={{ fontSize:15, fontWeight:500 }}>No tests yet</div>
                  <div style={{ fontSize:13, marginTop:4 }}>Create your first test to get started</div>
                  <button onClick={()=>setView("create")}
                    style={{ marginTop:20, padding:"10px 22px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", fontWeight:600, cursor:"pointer", fontSize:14, fontFamily:"inherit" }}>
                    Create Test
                  </button>
                </div>
              ) : tests.map((test, idx) => {
                const st = getTestStatus(test);
                const shareUrl = buildShareUrl(test.id);
                return (
                  <div key={test.id} style={{ padding:"16px 24px", borderBottom: idx < tests.length-1 ? `1px solid ${DS.border}` : "none", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontWeight:600, fontSize:14, color:DS.text }}>{test.title}</div>
                      <div style={{ fontSize:12, color:DS.textSub, marginTop:3 }}>{test.subject} · {test.questions?.length||0} questions · {test.durationMins} min · by {test.createdBy}</div>
                      <div style={{ marginTop:6, background:"#f8f9ff", borderRadius:6, padding:"5px 10px", display:"inline-flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:10, color:DS.textSub }}>Share:</span>
                        <span style={{ fontSize:10, color:"#4f46e5", fontFamily:"monospace", maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shareUrl}</span>
                      </div>
                    </div>
                    <div style={{ fontSize:12, color:DS.textSub }}>{test.scheduledAt ? fmtDate(test.scheduledAt) : "Available Now"}</div>
                    <StatusBadge status={st} />
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>copyLink(test.id)}
                        style={{ padding:"6px 14px", borderRadius:7, border:`1px solid ${copiedId===test.id?"#10b981":"#e0e7ff"}`,
                          background: copiedId===test.id ? "#f0fdf4" : "#eef2ff",
                          color: copiedId===test.id ? "#15803d" : "#4f46e5", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit" }}>
                        {copiedId===test.id ? "✓ Copied" : "Copy Link"}
                      </button>
                      <button onClick={()=>deleteTest(test.id)}
                        style={{ padding:"6px 12px", borderRadius:7, border:"1px solid #fecaca", background:"#fef2f2", color:"#b91c1c", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── SETTINGS ── */}
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

        {/* ── RESULTS ── */}
        {view === "results" && <AdminResultsView tests={tests} />}

        {/* ── STUDENTS ── */}
        {view === "students" && (
          <div>
            <div style={{ marginBottom:24 }}>
              <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Student Management</h1>
              <p style={{ margin:"4px 0 0", color:DS.textSub, fontSize:14 }}>Manage student accounts and access</p>
            </div>

            <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, padding:28, marginBottom:20 }}>
              <h3 style={{ margin:"0 0 16px", color:DS.text, fontSize:15, fontWeight:700 }}>Add New Student</h3>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:12, alignItems:"end" }}>
                <div>
                  <Label>Full Name</Label>
                  <input value={newSP.name} onChange={e=>setNewSP(p=>({...p,name:e.target.value}))} placeholder="e.g. Arjun Mehta"
                    style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text }}
                    onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                </div>
                <div>
                  <Label>Username (for login)</Label>
                  <input value={newSP.username} onChange={e=>setNewSP(p=>({...p,username:e.target.value}))} placeholder="e.g. arjun"
                    style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text }}
                    onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                </div>
                <div>
                  <Label>Password</Label>
                  <input value={newSP.password} onChange={e=>setNewSP(p=>({...p,password:e.target.value}))} placeholder="e.g. arjun123"
                    style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text }}
                    onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                </div>
                <button onClick={addStudent}
                  style={{ padding:"10px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", fontWeight:700, cursor:"pointer", fontSize:14, fontFamily:"inherit", whiteSpace:"nowrap", height:42 }}>
                  Add
                </button>
              </div>
              {spMsg && <div style={{ marginTop:10, color: spMsg.startsWith("✅") ? "#15803d" : "#b91c1c", fontSize:13, fontWeight:500 }}>{spMsg}</div>}
            </div>

            <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, overflow:"hidden" }}>
              <div style={{ padding:"16px 24px", borderBottom:`1px solid ${DS.border}` }}>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:DS.text }}>{studentPasswords.length} Student{studentPasswords.length !== 1 ? "s" : ""} registered</h3>
              </div>
              {studentPasswords.length === 0 ? (
                <div style={{ padding:"48px 0", textAlign:"center", color:DS.textMuted }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🧑‍🎓</div>
                  <div>No students added yet.</div>
                </div>
              ) : studentPasswords.map(sp => (
                <StudentPasswordRow key={sp.name} sp={sp} onRemove={removeStudent} onUpdate={updateStudentPassword} />
              ))}
            </div>
          </div>
        )}

        {/* ── CREATE TEST ── */}
        {view === "create" && (
          <div>
            <div style={{ marginBottom:24 }}>
              <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Create New Test</h1>
              <p style={{ margin:"4px 0 0", color:DS.textSub, fontSize:14 }}>AI extracts questions automatically from your PDF</p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", gap:20, alignItems:"start" }}>
              {/* Main form */}
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                {/* Basic info card */}
                <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, padding:24 }}>
                  <h3 style={{ margin:"0 0 20px", fontSize:15, fontWeight:700, color:DS.text }}>Test Details</h3>
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div>
                      <Label>Test Title *</Label>
                      <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. JEE Main Mock Test 1"
                        style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text }}
                        onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <div>
                        <Label>Subject / Topic</Label>
                        <input value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} placeholder="Physics / All Subjects"
                          style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text }}
                          onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                      </div>
                      <div>
                        <Label>Duration (minutes)</Label>
                        <input type="number" value={form.durationMins} onChange={e=>setForm(f=>({...f,durationMins:e.target.value}))} placeholder="180"
                          style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text }}
                          onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                      </div>
                    </div>
                    <div>
                      <Label>Schedule Date & Time (leave blank for immediate)</Label>
                      <input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm(f=>({...f,scheduledAt:e.target.value}))}
                        style={{ padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", fontFamily:"inherit", background:"white", color:DS.text }}
                        onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
                    </div>
                  </div>
                </div>

                {/* Source card */}
                <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, padding:24 }}>
                  <h3 style={{ margin:"0 0 16px", fontSize:15, fontWeight:700, color:DS.text }}>Question Source</h3>

                  {/* Source tabs */}
                  <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                    {[["upload","📄 Upload PDF"],["drive","📁 Google Drive"],["demo","🎯 Demo"]].map(([val,lbl])=>(
                      <button key={val} onClick={()=>setForm(f=>({...f,mode:val}))}
                        style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${form.mode===val?"#4f46e5":"#e5e7eb"}`,
                          background:form.mode===val?"#eef2ff":"white", color:form.mode===val?"#4338ca":DS.textSub,
                          fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {form.mode === "upload" && (
                    <div>
                      {/* Upload style */}
                      <div style={{ display:"flex", gap:0, marginBottom:18, borderRadius:9, overflow:"hidden", border:`1.5px solid ${DS.border}` }}>
                        {[["combined","📄 Combined PDF","All subjects in one file"],["separate","📚 Separate PDFs","One PDF per subject"]].map(([val,lbl,sub])=>(
                          <button key={val} onClick={()=>setUploadMode(val)}
                            style={{ flex:1, padding:"11px 16px", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                              background: uploadMode===val ? "#eef2ff" : "white",
                              color: uploadMode===val ? "#4338ca" : DS.textSub,
                              borderRight: val==="combined" ? `1px solid ${DS.border}` : "none" }}>
                            <div style={{ fontWeight:700, fontSize:13 }}>{lbl}</div>
                            <div style={{ fontSize:11, opacity:0.6, marginTop:1 }}>{sub}</div>
                          </button>
                        ))}
                      </div>

                      {uploadMode === "combined" && (
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                          {[["Question Paper PDF", paperRef, paperFile, setPaperFile],["Answer Key PDF (optional)", keyRef, keyFile, setKeyFile]].map(([lbl,ref,file,setter])=>(
                            <div key={lbl}>
                              <Label>{lbl}</Label>
                              <div onClick={()=>ref.current.click()}
                                style={{ border:`2px dashed ${file?"#4f46e5":DS.border}`, borderRadius:DS.r, padding:"20px 16px", textAlign:"center", cursor:"pointer",
                                  background:file?"#eef2ff":"#fafafa", transition:"all 0.15s" }}>
                                <input type="file" accept=".pdf" ref={ref} style={{ display:"none" }} onChange={e=>setter(e.target.files[0])} />
                                {file ? (
                                  <><div style={{ fontSize:24, marginBottom:6 }}>✅</div><div style={{ color:"#4338ca", fontSize:13, fontWeight:600 }}>{file.name}</div><div style={{ color:DS.textMuted, fontSize:11, marginTop:4 }}>Click to change</div></>
                                ) : (
                                  <><div style={{ fontSize:24, marginBottom:6 }}>📄</div><div style={{ color:DS.textSub, fontSize:13, fontWeight:500 }}>Click to upload PDF</div><div style={{ color:DS.textMuted, fontSize:11, marginTop:4 }}>or drag and drop</div></>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {uploadMode === "separate" && (
                        <div>
                          {sections.map((sec, si) => {
                            const subColors = { Physics:{accent:"#3b82f6",bg:"#eff6ff",icon:"⚛️"}, Chemistry:{accent:"#22c55e",bg:"#f0fdf4",icon:"🧪"}, Mathematics:{accent:"#8b5cf6",bg:"#f5f3ff",icon:"📐"} };
                            const col = subColors[sec.subject] || {accent:"#6b7280",bg:"#f9fafb",icon:"📚"};
                            return (
                              <div key={sec.subject} style={{ marginBottom:12, borderRadius:DS.rLg, border:`1.5px solid ${sec.enabled?col.accent:DS.border}`, overflow:"hidden", opacity:sec.enabled?1:0.5 }}>
                                <div style={{ background:sec.enabled?col.bg:"#f9fafb", padding:"11px 16px", display:"flex", alignItems:"center", gap:10 }}>
                                  <span style={{ fontSize:18 }}>{col.icon}</span>
                                  <div style={{ flex:1, fontWeight:700, fontSize:14, color:sec.enabled?col.accent:DS.textSub }}>{sec.subject}</div>
                                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                                    {[["MCQ","mcq"],["Int","integer"]].map(([label,key])=>(
                                      <div key={key} style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                                        <div style={{ fontSize:9, color:DS.textSub, marginBottom:2 }}>{label}</div>
                                        <input type="number" min="0" max="50" value={sec[key]}
                                          onChange={e=>setSections(p=>p.map((s,i)=>i===si?{...s,[key]:Number(e.target.value)}:s))}
                                          style={{ width:44, padding:"3px 6px", borderRadius:6, border:`1px solid ${DS.border}`, fontSize:13, fontWeight:700, textAlign:"center", outline:"none" }} />
                                      </div>
                                    ))}
                                  </div>
                                  <button onClick={()=>setSections(p=>p.map((s,i)=>i===si?{...s,enabled:!s.enabled}:s))}
                                    style={{ padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
                                      background:sec.enabled?col.accent:"#e5e7eb", color:sec.enabled?"white":DS.textSub }}>
                                    {sec.enabled?"On":"Off"}
                                  </button>
                                </div>
                                {sec.enabled && (
                                  <div style={{ padding:"10px 16px", background:"white" }}>
                                    <div onClick={()=>sectionRefs.current[si]?.click()}
                                      style={{ border:`2px dashed ${sec.file?col.accent:DS.border}`, borderRadius:8, padding:"12px 16px", textAlign:"center", cursor:"pointer",
                                        background:sec.file?col.bg:"#fafafa", display:"flex", alignItems:"center", gap:10 }}>
                                      <input type="file" accept=".pdf" ref={el=>sectionRefs.current[si]=el} style={{ display:"none" }}
                                        onChange={e=>setSections(p=>p.map((s,i)=>i===si?{...s,file:e.target.files[0]}:s))} />
                                      <div style={{ fontSize:20 }}>{sec.file?"✅":"📄"}</div>
                                      <div style={{ textAlign:"left", flex:1 }}>
                                        {sec.file ? <><div style={{ color:col.accent, fontSize:13, fontWeight:600 }}>{sec.file.name}</div><div style={{ color:DS.textMuted, fontSize:11, marginTop:1 }}>Click to change</div></> : <><div style={{ color:DS.textSub, fontSize:13 }}>Upload {sec.subject} PDF</div><div style={{ color:DS.textMuted, fontSize:11, marginTop:1 }}>Only {sec.subject} questions</div></>}
                                      </div>
                                      {sec.file && <button onClick={e=>{e.stopPropagation();setSections(p=>p.map((s,i)=>i===si?{...s,file:null}:s));}} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #fecaca", background:"#fef2f2", color:"#b91c1c", cursor:"pointer", fontSize:11, fontWeight:700 }}>Remove</button>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div style={{ marginTop:8 }}>
                            <Label>Answer Key PDF (optional)</Label>
                            <div onClick={()=>keyRef.current.click()}
                              style={{ border:`2px dashed ${keyFile?"#4f46e5":DS.border}`, borderRadius:DS.r, padding:"12px 16px", textAlign:"center", cursor:"pointer", background:keyFile?"#eef2ff":"#fafafa" }}>
                              <input type="file" accept=".pdf" ref={keyRef} style={{ display:"none" }} onChange={e=>setKeyFile(e.target.files[0])} />
                              {keyFile?<div style={{ color:"#4338ca", fontSize:13, fontWeight:600 }}>✅ {keyFile.name}</div>:<div style={{ color:DS.textSub, fontSize:13 }}>Click to upload Answer Key PDF</div>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {form.mode === "drive" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {form.driveApiKey ? (
                        <div style={{ background:DS.successLight, borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
                          <span>✅</span><div style={{ fontSize:13, color:"#15803d", fontWeight:600 }}>Drive API Key loaded from Settings</div>
                        </div>
                      ) : (
                        <div><Label>Google Drive API Key</Label><input value={form.driveApiKey} onChange={e=>setForm(f=>({...f,driveApiKey:e.target.value}))} placeholder="AIzaSy..." style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit" }} /></div>
                      )}
                      <div><Label>Question Paper File ID</Label><input value={form.drivePaperFileId} onChange={e=>setForm(f=>({...f,drivePaperFileId:e.target.value}))} placeholder="1BxiMVs0XRA5n..." style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit" }} /></div>
                      <div><Label>Answer Key File ID (optional)</Label><input value={form.driveKeyFileId} onChange={e=>setForm(f=>({...f,driveKeyFileId:e.target.value}))} placeholder="1BxiMVs0XRA5n..." style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit" }} /></div>
                    </div>
                  )}

                  {form.mode === "demo" && (
                    <div style={{ background:DS.successLight, borderRadius:DS.r, padding:"14px 16px", fontSize:13, color:"#15803d", border:"1px solid #bbf7d0" }}>
                      ✅ Will use 9 sample JEE questions (3 Physics, 3 Chemistry, 3 Mathematics)
                    </div>
                  )}
                </div>
              </div>

              {/* Right summary / submit card */}
              <div style={{ position:"sticky", top:80 }}>
                <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadowMd, border:`1px solid ${DS.border}`, padding:24 }}>
                  <h3 style={{ margin:"0 0 16px", fontSize:15, fontWeight:700, color:DS.text }}>Create Test</h3>

                  <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
                    {[
                      ["Title", form.title || "—"],
                      ["Duration", `${form.durationMins} min`],
                      ["Source", form.mode === "upload" ? "PDF Upload" : form.mode === "drive" ? "Google Drive" : "Demo"],
                      ["Scheduled", form.scheduledAt ? fmtDate(form.scheduledAt) : "Immediately"],
                    ].map(([k,v]) => (
                      <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                        <span style={{ color:DS.textSub }}>{k}</span>
                        <span style={{ fontWeight:600, color:DS.text, textAlign:"right", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <AlertBanner msg={status} type={statusType} />

                  <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:16 }}>
                    <button onClick={createTest} disabled={loading}
                      style={{ padding:"13px", borderRadius:9, border:"none", background:loading?"#c7d2fe":"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", fontWeight:700, cursor:loading?"default":"pointer", fontSize:14, fontFamily:"inherit" }}>
                      {loading ? "⏳ Processing..." : "🚀 Create Test"}
                    </button>
                    <button onClick={()=>{ setView("dashboard"); setStatus(""); setSections(DEFAULT_SECTIONS); setUploadMode("combined"); }}
                      style={{ padding:"11px", borderRadius:9, border:`1px solid ${DS.border}`, background:"white", color:DS.textSub, fontWeight:600, cursor:"pointer", fontSize:14, fontFamily:"inherit" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SETTINGS VIEW
════════════════════════════════════════════════════ */
function SettingsView({ savedDriveKey, savedModel, onSave }) {
  const [drive, setDrive] = useState(savedDriveKey || "");
  const [model, setModel] = useState(savedModel || "gemini-2.0-flash");
  const [msg, setMsg] = useState("");
  const [showDrive, setShowDrive] = useState(false);
  const [liveModels, setLiveModels] = useState([]);

  useEffect(() => { setDrive(savedDriveKey || ""); }, [savedDriveKey]);

  useEffect(() => {
    fetch("/api/models").then(r=>r.json()).then(d=>{ if (d.models) setLiveModels(d.models); }).catch(()=>{});
  }, []);

  const maskKey = (k) => k.length > 8 ? k.slice(0,6) + "••••••••" + k.slice(-4) : k ? "••••••••" : "";

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Settings</h1>
        <p style={{ margin:"4px 0 0", color:DS.textSub, fontSize:14 }}>Configure integrations and AI model preferences</p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:600 }}>
        {/* Google Drive */}
        <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, padding:24 }}>
          <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:700, color:DS.text }}>Google Drive Integration</h3>
          <p style={{ margin:"0 0 18px", color:DS.textSub, fontSize:13 }}>Connect your Drive to upload PDFs directly from Google Drive.</p>
          <div style={{ marginBottom:14 }}>
            <Label>Google Drive API Key</Label>
            <div style={{ display:"flex", gap:10 }}>
              <input type={showDrive?"text":"password"} value={drive} onChange={e=>setDrive(e.target.value)} placeholder="AIzaSy..."
                style={{ flex:1, padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", fontFamily:"inherit", color:DS.text }}
                onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
              <button onClick={()=>setShowDrive(v=>!v)}
                style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${DS.border}`, background:"white", color:DS.textSub, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                {showDrive?"Hide":"Show"}
              </button>
            </div>
          </div>
          {drive && <div style={{ background:"#f0fdf4", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#15803d", marginBottom:14 }}>✅ Key saved: {maskKey(drive)}</div>}
        </div>

        {/* AI Model */}
        <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, padding:24 }}>
          <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:700, color:DS.text }}>AI Model</h3>
          <p style={{ margin:"0 0 18px", color:DS.textSub, fontSize:13 }}>Choose the Gemini model used for question extraction.</p>
          <Label>Gemini Model</Label>
          <select value={model} onChange={e=>setModel(e.target.value)}
            style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", fontFamily:"inherit", color:DS.text, cursor:"pointer" }}>
            {(liveModels.length > 0 ? liveModels : ["gemini-2.5-flash","gemini-2.0-flash","gemini-1.5-flash","gemini-1.5-pro"]).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {liveModels.length > 0 && <div style={{ marginTop:8, fontSize:12, color:DS.textSub }}>{liveModels.length} models available from API</div>}
        </div>

        <button onClick={async()=>{ await onSave(drive,model); setMsg("✅ Settings saved!"); setTimeout(()=>setMsg(""),2500); }}
          style={{ padding:"13px 28px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", fontWeight:700, cursor:"pointer", fontSize:14, fontFamily:"inherit", alignSelf:"flex-start" }}>
          Save Settings
        </button>
        {msg && <div style={{ color:"#15803d", fontSize:13, fontWeight:500 }}>{msg}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   ADMIN RESULTS VIEW
════════════════════════════════════════════════════ */
function AdminResultsView({ tests }) {
  const [allResults, setAllResults] = useState({});
  const [selTest, setSelTest] = useState(null);

  useEffect(() => {
    dbGet("all-results").then(r => setAllResults(r || {}));
  }, []);

  const test = selTest ? tests.find(t => t.id === selTest) : null;
  const entries = test ? Object.entries(allResults).filter(([k]) => k.endsWith("__" + test.id.split("").reverse().join("")) || k.includes(test.id)) : [];

  // Gather all students who submitted for this test
  const submissions = test ? Object.entries(allResults)
    .filter(([k]) => k.endsWith("__" + test.id) || k.startsWith(test.id + "__"))
    .map(([k, v]) => {
      const student = k.replace(test.id + "__","").replace("__" + test.id,"");
      return { student, ...v };
    }) : [];

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Results</h1>
        <p style={{ margin:"4px 0 0", color:DS.textSub, fontSize:14 }}>View student submissions and scores</p>
      </div>

      <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, padding:24, marginBottom:20 }}>
        <Label>Select Test</Label>
        <select value={selTest||""} onChange={e=>setSelTest(e.target.value||null)}
          style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", fontFamily:"inherit", color:DS.text, cursor:"pointer" }}>
          <option value="">-- Choose a test --</option>
          {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      {test && (
        <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, overflow:"hidden" }}>
          <div style={{ padding:"16px 24px", borderBottom:`1px solid ${DS.border}` }}>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:DS.text }}>{test.title}</h3>
            <p style={{ margin:"2px 0 0", fontSize:12, color:DS.textSub }}>{submissions.length} submissions</p>
          </div>
          {submissions.length === 0 ? (
            <div style={{ padding:"48px 0", textAlign:"center", color:DS.textMuted }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
              <div>No submissions yet</div>
            </div>
          ) : submissions.map((sub, i) => {
            const qs = test.questions || [];
            const results = qs.map((q, qi) => {
              const given = sub.answers?.[qi];
              const blank = given === undefined || given === null || given === "" || (typeof given === "number" && isNaN(given));
              const correct = !blank && String(given) === String(q.correct);
              const wrong = !blank && !correct;
              const qMarks = Number(q.marks) || 4;
              const qNeg = q.negative !== undefined ? Number(q.negative) : -1;
              return { correct, wrong, blank, earned: correct ? qMarks : wrong ? qNeg : 0, marks: qMarks };
            });
            const scored = results.reduce((s,r) => s+r.earned, 0);
            const maxMarks = results.reduce((s,r) => s+r.marks, 0);
            const pct = maxMarks > 0 ? Math.max(0, Math.round((scored/maxMarks)*100)) : 0;
            const scoreColor = pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c";
            return (
              <div key={i} style={{ padding:"16px 24px", borderBottom: i < submissions.length-1 ? `1px solid ${DS.border}` : "none", display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#4f46e5", flexShrink:0 }}>
                  {(sub.student||"?")[0].toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14, color:DS.text }}>{sub.student}</div>
                  <div style={{ fontSize:12, color:DS.textSub, marginTop:2 }}>
                    ✅ {results.filter(r=>r.correct).length} correct · ❌ {results.filter(r=>r.wrong).length} wrong · ⏱ {fmt(sub.timeTaken||0)}
                  </div>
                  <div style={{ marginTop:8, height:5, background:"#f3f4f6", borderRadius:99, overflow:"hidden", maxWidth:280 }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:scoreColor, borderRadius:99, transition:"width 0.5s" }} />
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:22, fontWeight:700, color:scoreColor, fontFamily:"'Space Grotesk', sans-serif" }}>{scored}</div>
                  <div style={{ fontSize:11, color:DS.textSub }}>/{maxMarks} pts · {pct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   STUDENT PASSWORD ROW
════════════════════════════════════════════════════ */
function StudentPasswordRow({ sp, onRemove, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState(sp.password || "");
  const [show, setShow] = useState(false);

  return (
    <div style={{ padding:"14px 24px", borderBottom:`1px solid ${DS.border}`, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
      <div style={{ width:34, height:34, borderRadius:"50%", background:"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#4f46e5", flexShrink:0 }}>
        {(sp.name||"?")[0].toUpperCase()}
      </div>
      <div style={{ flex:1, minWidth:120 }}>
        <div style={{ fontWeight:600, fontSize:14, color:DS.text }}>{sp.name}</div>
        <div style={{ fontSize:12, color:DS.textSub }}>@{sp.username}</div>
      </div>
      {editing ? (
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input type={show?"text":"password"} value={pw} onChange={e=>setPw(e.target.value)}
            style={{ padding:"7px 12px", borderRadius:7, border:`1.5px solid ${DS.border}`, fontSize:13, outline:"none", width:160, fontFamily:"inherit" }}
            onFocus={e=>e.target.style.borderColor="#6366f1"} onBlur={e=>e.target.style.borderColor=DS.border} />
          <button onClick={()=>setShow(v=>!v)} style={{ padding:"6px 10px", borderRadius:7, border:`1px solid ${DS.border}`, background:"white", color:DS.textSub, cursor:"pointer", fontSize:11 }}>{show?"•••":"👁"}</button>
          <button onClick={()=>{ onUpdate(sp.name,pw); setEditing(false); }} style={{ padding:"7px 14px", borderRadius:7, border:"none", background:"#4f46e5", color:"white", cursor:"pointer", fontSize:12, fontWeight:600 }}>Save</button>
          <button onClick={()=>setEditing(false)} style={{ padding:"7px 12px", borderRadius:7, border:`1px solid ${DS.border}`, background:"white", color:DS.textSub, cursor:"pointer", fontSize:12 }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:12, color:DS.textMuted, fontFamily:"monospace", background:"#f3f4f6", padding:"4px 10px", borderRadius:6 }}>••••••••</span>
          <button onClick={()=>setEditing(true)} style={{ padding:"6px 14px", borderRadius:7, border:`1px solid ${DS.border}`, background:"white", color:DS.textMid, cursor:"pointer", fontSize:12, fontWeight:500 }}>Edit</button>
          <button onClick={()=>onRemove(sp.name)} style={{ padding:"6px 12px", borderRadius:7, border:"1px solid #fecaca", background:"#fef2f2", color:"#b91c1c", cursor:"pointer", fontSize:12, fontWeight:500 }}>Remove</button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   STUDENT SCREEN
════════════════════════════════════════════════════ */
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

  const submittedTests = tests.filter(t => submittedIds.has(t.id));

  return (
    <div style={{ minHeight:"100vh", background:DS.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <FontImport />
      {!serverReady && <ServerWarnBanner />}
      <TopNav
        subtitle="Student Portal"
        user={user}
        onLogout={onLogout}
        navItems={[]}
      />

      <div style={{ maxWidth:860, margin:"0 auto", padding:"32px 24px" }}>
        <div style={{ marginBottom:28 }}>
          <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Welcome back, {user.name} 👋</h1>
          <p style={{ margin:"4px 0 0", color:DS.textSub, fontSize:14 }}>Here are your available tests</p>
        </div>

        <Section title="Available Now" count={available.length} color="#ef4444">
          {available.length === 0 ? <Empty text="No live tests right now" /> : available.map(test => (
            <TestCard key={test.id} test={test} status={TEST_STATUS.LIVE}
              action={
                submittedIds.has(test.id)
                  ? <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ padding:"8px 14px", borderRadius:8, background:DS.successLight, color:"#15803d", fontWeight:600, fontSize:13 }}>✅ Submitted</span>
                      <button onClick={() => onViewResult(test, allResults[`${test.id}__${user.name}`])}
                        style={{ padding:"8px 16px", borderRadius:8, border:`1px solid #4f46e5`, background:"#eef2ff", color:"#4338ca", fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                        View Analysis →
                      </button>
                    </div>
                  : <button onClick={()=>onStart(test)} style={{ padding:"10px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#ef4444,#dc2626)", color:"white", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                      Start Test
                    </button>
              } />
          ))}
        </Section>

        <Section title="Upcoming" count={upcoming.length} color="#f59e0b">
          {upcoming.length === 0 ? <Empty text="No upcoming tests" /> : upcoming.map(test => (
            <TestCard key={test.id} test={test} status={TEST_STATUS.SCHEDULED}
              action={<Countdown target={new Date(test.scheduledAt).getTime()} />} />
          ))}
        </Section>

        <Section title="Completed" count={ended.length} color="#10b981">
          {ended.length === 0 ? <Empty text="No past tests" /> : ended.map(test => (
            <TestCard key={test.id} test={test} status={TEST_STATUS.ENDED}
              action={
                submittedIds.has(test.id)
                  ? <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ padding:"7px 12px", borderRadius:8, background:DS.successLight, color:"#15803d", fontWeight:600, fontSize:12 }}>✅ Submitted</span>
                      <button onClick={() => onViewResult(test, allResults[`${test.id}__${user.name}`])}
                        style={{ padding:"7px 14px", borderRadius:8, border:`1px solid #4f46e5`, background:"#eef2ff", color:"#4338ca", fontWeight:600, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
                        Analysis →
                      </button>
                    </div>
                  : <span style={{ color:DS.textMuted, fontSize:13 }}>Test ended</span>
              } />
          ))}
        </Section>

        {submittedTests.length > 0 && (
          <Section title="My Performance" count={submittedTests.length} color="#4f46e5">
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
              const pct = maxMarks > 0 ? Math.max(0, Math.round((scored / maxMarks) * 100)) : 0;
              const scoreColor = pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c";
              return (
                <div key={test.id} style={{ background:DS.surface, borderRadius:DS.rLg, padding:"20px 24px", marginBottom:12, boxShadow:DS.shadow, border:`1px solid ${DS.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:DS.text }}>{test.title}</div>
                      <div style={{ fontSize:12, color:DS.textSub, marginTop:3 }}>{test.subject} · {qs.length} questions · {test.durationMins} min</div>
                      <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, color:"#15803d", fontWeight:600 }}>✅ {nC} Correct</span>
                        <span style={{ fontSize:13, color:"#ef4444", fontWeight:600 }}>❌ {nW} Wrong</span>
                        <span style={{ fontSize:13, color:DS.textSub }}>⏱ {fmt(sub.timeTaken || 0)}</span>
                      </div>
                      <div style={{ marginTop:10, maxWidth:320 }}>
                        <div style={{ height:6, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:scoreColor, borderRadius:99, transition:"width 0.5s" }} />
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:32, fontWeight:700, color:scoreColor, fontFamily:"'Space Grotesk', sans-serif", lineHeight:1 }}>{scored}</div>
                      <div style={{ fontSize:11, color:DS.textSub }}>/{maxMarks} marks</div>
                      <div style={{ fontSize:15, fontWeight:700, color:scoreColor, marginTop:2 }}>{pct}%</div>
                      <button onClick={() => onViewResult(test, sub)}
                        style={{ marginTop:10, padding:"8px 18px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", fontWeight:600, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
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

/* ── SECTION, EMPTY, TESTCARD, COUNTDOWN ── */
function Section({ title, count, color, children }) {
  return (
    <div style={{ marginBottom:32 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:15, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>{title}</div>
        <div style={{ background:color, color:"white", borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{count}</div>
      </div>
      {children}
    </div>
  );
}
function Empty({ text }) {
  return (
    <div style={{ background:DS.surface, borderRadius:DS.rLg, padding:"24px", textAlign:"center", color:DS.textMuted, fontSize:13, boxShadow:DS.shadow, border:`1px solid ${DS.border}` }}>
      {text}
    </div>
  );
}
function TestCard({ test, status, action }) {
  const badges = {
    [TEST_STATUS.LIVE]: "live",
    [TEST_STATUS.SCHEDULED]: "scheduled",
    [TEST_STATUS.ENDED]: "ended",
  };
  return (
    <div style={{ background:DS.surface, borderRadius:DS.rLg, padding:"18px 22px", marginBottom:10, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:180 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <div style={{ fontWeight:700, fontSize:15, color:DS.text }}>{test.title}</div>
          <StatusBadge status={badges[status]} />
        </div>
        <div style={{ fontSize:12, color:DS.textSub }}>{test.subject} · {test.questions?.length||0} questions · {test.durationMins} min</div>
        {test.scheduledAt && <div style={{ fontSize:11, color:DS.textMuted, marginTop:2 }}>Scheduled: {fmtDate(test.scheduledAt)}</div>}
      </div>
      {action}
    </div>
  );
}
function Countdown({ target }) {
  const [diff, setDiff] = useState(Math.max(0, Math.floor((target - Date.now()) / 1000)));
  useEffect(() => { const t = setInterval(()=>setDiff(Math.max(0, Math.floor((target-Date.now())/1000))), 1000); return ()=>clearInterval(t); }, [target]);
  const h = Math.floor(diff/3600), m = Math.floor((diff%3600)/60), s = diff%60;
  return (
    <div style={{ fontWeight:700, fontSize:18, color:"#b45309", fontVariantNumeric:"tabular-nums", fontFamily:"'Space Grotesk', sans-serif" }}>
      {`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
    </div>
  );
}

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
                {renderQuestionText(cur.text, false, cur.figurePageNumber, cur.figureImageData)}
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
                        {renderQuestionText(opt, true, cur.figurePageNumber, cur.figureImageData)}
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
/* ════════════════════════════════════════════════════
   RESULTS SCREEN
════════════════════════════════════════════════════ */
function ResultsScreen({ test, student, submission, onBack }) {
  const qs = test.questions || DEMO_QUESTIONS;
  const shareResult = () => {
    const url = buildResultUrl(test.id, student);
    navigator.clipboard.writeText(url);
  };

  const results = qs.map((q, i) => {
    const given = submission?.answers?.[i];
    const blank = given === undefined || given === null || given === "" || (typeof given === "number" && isNaN(given));
    const correct = !blank && String(given) === String(q.correct);
    const wrong = !blank && !correct;
    const qMarks = Number(q.marks) || 4;
    const qNeg = (q.negative !== undefined && q.negative !== null) ? Number(q.negative) : -1;
    return { q, given, blank, correct, wrong, earned: correct ? qMarks : wrong ? qNeg : 0, marks: qMarks };
  });

  const scored = results.reduce((s, r) => s + r.earned, 0);
  const maxMarks = results.reduce((s, r) => s + r.marks, 0);
  const nC = results.filter(r => r.correct).length;
  const nW = results.filter(r => r.wrong).length;
  const nS = results.filter(r => r.blank).length;
  const pct = maxMarks > 0 ? Math.max(0, Math.round((scored/maxMarks)*100)) : 0;
  const scoreColor = pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c";

  const subjectSummary = ["Physics","Chemistry","Mathematics"].map(sub => {
    const qList = results.filter(r => r.q.subject === sub);
    if (!qList.length) return null;
    const sc = qList.reduce((s,r) => s+r.earned, 0);
    const mx = qList.reduce((s,r) => s+r.marks, 0);
    const pct = mx > 0 ? Math.max(0, Math.round((sc/mx)*100)) : 0;
    const subColor = pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c";
    return { sub, sc, mx, pct, subColor, correct: qList.filter(r=>r.correct).length, wrong: qList.filter(r=>r.wrong).length, total: qList.length };
  }).filter(Boolean);

  return (
    <div style={{ minHeight:"100vh", background:DS.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <FontImport />
      {/* Header */}
      <div style={{ background:DS.navBg, padding:"0 24px", height:56, display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🎯</div>
          <span style={{ color:"white", fontWeight:700, fontSize:15, fontFamily:"'Space Grotesk', sans-serif" }}>TestForge</span>
        </div>
        <div style={{ flex:1 }} />
        <button onClick={shareResult}
          style={{ padding:"7px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
          Share Result
        </button>
        <button onClick={onBack}
          style={{ padding:"7px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
          ← Back
        </button>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"32px 24px" }}>
        {/* Score hero */}
        <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadowMd, border:`1px solid ${DS.border}`, padding:"32px", marginBottom:24, display:"flex", gap:32, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ color:DS.textSub, fontSize:12, fontWeight:600, letterSpacing:0.8, textTransform:"uppercase", marginBottom:4 }}>Test Result</div>
            <h1 style={{ margin:"0 0 4px", fontSize:22, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>{test.title}</h1>
            <div style={{ fontSize:14, color:DS.textSub }}>{student} · {fmt(submission?.timeTaken||0)}</div>

            <div style={{ display:"flex", gap:20, marginTop:20, flexWrap:"wrap" }}>
              {[
                { label:"Correct", val:nC, color:"#15803d", bg:"#dcfce7" },
                { label:"Wrong", val:nW, color:"#b91c1c", bg:"#fee2e2" },
                { label:"Skipped", val:nS, color:"#6b7280", bg:"#f3f4f6" },
              ].map(s => (
                <div key={s.label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:"'Space Grotesk', sans-serif" }}>{s.val}</div>
                  <div style={{ fontSize:11, color:DS.textSub, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:20, maxWidth:400 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, color:DS.textSub }}>Score</span>
                <span style={{ fontSize:12, fontWeight:700, color:scoreColor }}>{pct}%</span>
              </div>
              <div style={{ height:8, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:scoreColor, borderRadius:99 }} />
              </div>
            </div>
          </div>

          <div style={{ textAlign:"center", padding:"0 20px" }}>
            <div style={{ fontSize:56, fontWeight:700, color:scoreColor, fontFamily:"'Space Grotesk', sans-serif", lineHeight:1 }}>{scored}</div>
            <div style={{ fontSize:16, color:DS.textSub, marginTop:4 }}>/{maxMarks}</div>
            <div style={{ fontSize:13, fontWeight:600, color:DS.textSub, marginTop:4 }}>marks</div>
          </div>
        </div>

        {/* Subject breakdown */}
        {subjectSummary.length > 0 && (
          <div style={{ display:"flex", gap:14, marginBottom:24, flexWrap:"wrap" }}>
            {subjectSummary.map(s => (
              <div key={s.sub} style={{ flex:"1 1 160px", background:DS.surface, borderRadius:DS.rLg, padding:"18px 20px", boxShadow:DS.shadow, border:`1px solid ${DS.border}` }}>
                <div style={{ fontWeight:700, fontSize:14, color:DS.text, marginBottom:10 }}>{s.sub}</div>
                <div style={{ fontSize:24, fontWeight:700, color:s.subColor, fontFamily:"'Space Grotesk', sans-serif", lineHeight:1 }}>{s.sc}</div>
                <div style={{ fontSize:11, color:DS.textSub }}>/{s.mx} pts</div>
                <div style={{ marginTop:8, height:5, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${s.pct}%`, background:s.subColor, borderRadius:99 }} />
                </div>
                <div style={{ display:"flex", gap:12, marginTop:8 }}>
                  <span style={{ fontSize:11, color:"#15803d" }}>✅ {s.correct}</span>
                  <span style={{ fontSize:11, color:"#ef4444" }}>❌ {s.wrong}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Question review */}
        <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadow, border:`1px solid ${DS.border}`, overflow:"hidden" }}>
          <div style={{ padding:"18px 24px", borderBottom:`1px solid ${DS.border}` }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>Question Review</h2>
          </div>
          {results.map((r, i) => {
            const q = r.q;
            const sub = q.subject;
            const subColor = sub==="Physics"?"#3b82f6":sub==="Chemistry"?"#22c55e":"#8b5cf6";
            return (
              <div key={i} style={{ padding:"18px 24px", borderBottom: i < results.length-1 ? `1px solid ${DS.border}` : "none" }}>
                <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                  {/* Status icon */}
                  <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700,
                    background: r.correct ? "#dcfce7" : r.wrong ? "#fee2e2" : "#f3f4f6",
                    color: r.correct ? "#15803d" : r.wrong ? "#b91c1c" : "#9ca3af" }}>
                    {r.correct ? "✓" : r.wrong ? "✗" : "–"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:DS.textSub }}>Q{i+1}</span>
                      <span style={{ fontSize:11, color:subColor, background:subColor+"18", padding:"2px 8px", borderRadius:99, fontWeight:600 }}>{sub}</span>
                      <span style={{ fontSize:11, color:DS.textMuted }}>{q.type?.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize:14, color:DS.text, lineHeight:1.6, marginBottom:q.options?.length?10:0 }}>
                      {renderQuestionText(q.text, true, q.figurePageNumber, q.figureImageData)}
                    </div>
                    {q.options?.length > 0 && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                        {q.options.map((opt, oi) => {
                          const isCorrect = oi === q.correct;
                          const isChosen = String(r.given) === String(oi);
                          return (
                            <div key={oi} style={{ padding:"7px 12px", borderRadius:7, fontSize:13,
                              background: isCorrect ? "#dcfce7" : isChosen&&!isCorrect ? "#fee2e2" : "#f9fafb",
                              border: `1px solid ${isCorrect ? "#86efac" : isChosen&&!isCorrect ? "#fca5a5" : DS.border}`,
                              color: isCorrect ? "#15803d" : isChosen&&!isCorrect ? "#b91c1c" : DS.textMid,
                              fontWeight: isCorrect||isChosen ? 600 : 400 }}>
                              <span style={{ fontWeight:700, marginRight:6 }}>{["A","B","C","D"][oi]}.</span>
                              {renderQuestionText(opt, true, null, null)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:16, fontSize:12 }}>
                      {q.type==="integer" && <span style={{ color:DS.textSub }}>Correct: <strong style={{ color:"#15803d" }}>{q.correct}</strong></span>}
                      {!r.blank && <span style={{ color:DS.textSub }}>Your answer: <strong style={{ color: r.correct?"#15803d":"#b91c1c" }}>{q.type==="integer"?r.given:["A","B","C","D"][r.given]}</strong></span>}
                      {r.blank && <span style={{ color:DS.textMuted }}>Not attempted</span>}
                      <span style={{ fontWeight:700, color: r.earned > 0 ? "#15803d" : r.earned < 0 ? "#b91c1c" : DS.textMuted }}>
                        {r.earned > 0 ? "+" : ""}{r.earned} pts
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SHARED RESULT SCREEN
════════════════════════════════════════════════════ */
function SharedResultScreen({ data }) {
  const { test, student, submission } = data;
  const qs = test.questions || DEMO_QUESTIONS;

  const results = qs.map((q, i) => {
    const given = submission?.answers?.[i];
    const blank = given === undefined || given === null || given === "" || (typeof given === "number" && isNaN(given));
    const correct = !blank && String(given) === String(q.correct);
    const wrong = !blank && !correct;
    const qMarks = Number(q.marks) || 4;
    const qNeg = (q.negative !== undefined && q.negative !== null) ? Number(q.negative) : -1;
    return { q, given, blank, correct, wrong, earned: correct ? qMarks : wrong ? qNeg : 0, marks: qMarks };
  });

  const scored = results.reduce((s, r) => s + r.earned, 0);
  const maxMarks = results.reduce((s, r) => s + r.marks, 0);
  const nC = results.filter(r => r.correct).length;
  const nW = results.filter(r => r.wrong).length;
  const pct = maxMarks > 0 ? Math.max(0, Math.round((scored/maxMarks)*100)) : 0;
  const scoreColor = pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c";

  return (
    <div style={{ minHeight:"100vh", background:DS.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <FontImport />
      <div style={{ background:DS.navBg, padding:"0 24px", height:56, display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🎯</div>
        <span style={{ color:"white", fontWeight:700, fontSize:15, fontFamily:"'Space Grotesk', sans-serif" }}>TestForge</span>
        <span style={{ color:"rgba(255,255,255,0.3)", fontSize:12, marginLeft:8 }}>Shared Result</span>
      </div>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"32px 24px" }}>
        <div style={{ background:DS.surface, borderRadius:DS.rXl, boxShadow:DS.shadowMd, border:`1px solid ${DS.border}`, padding:"32px", marginBottom:24, textAlign:"center" }}>
          <div style={{ color:DS.textSub, fontSize:12, fontWeight:600, letterSpacing:0.8, textTransform:"uppercase", marginBottom:8 }}>Shared Result</div>
          <h1 style={{ margin:"0 0 4px", fontSize:20, fontWeight:700, color:DS.text, fontFamily:"'Space Grotesk', sans-serif" }}>{test.title}</h1>
          <div style={{ fontSize:14, color:DS.textSub, marginBottom:24 }}>by {student}</div>

          <div style={{ fontSize:64, fontWeight:700, color:scoreColor, fontFamily:"'Space Grotesk', sans-serif", lineHeight:1 }}>{scored}</div>
          <div style={{ fontSize:16, color:DS.textSub, marginTop:4 }}>/ {maxMarks} marks ({pct}%)</div>

          <div style={{ display:"flex", justifyContent:"center", gap:24, marginTop:20 }}>
            <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:700, color:"#15803d" }}>{nC}</div><div style={{ fontSize:11, color:DS.textSub }}>Correct</div></div>
            <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:700, color:"#ef4444" }}>{nW}</div><div style={{ fontSize:11, color:DS.textSub }}>Wrong</div></div>
            <div style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:700, color:DS.textSub }}>{qs.length-nC-nW}</div><div style={{ fontSize:11, color:DS.textSub }}>Skipped</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   BASE COMPONENTS
════════════════════════════════════════════════════ */
function Label({ children }) {
  return <label style={{ color:DS.textSub, fontSize:11, fontWeight:600, letterSpacing:0.8, display:"block", marginBottom:6, textTransform:"uppercase", fontFamily:"'DM Sans', sans-serif" }}>{children}</label>;
}
function Input({ value, onChange, placeholder, type="text" }) {
  return (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${DS.border}`, fontSize:14, outline:"none", background:"white", boxSizing:"border-box", fontFamily:"inherit", color:DS.text, transition:"border-color 0.15s" }}
      onFocus={e=>{ e.target.style.borderColor="#6366f1"; e.target.style.boxShadow="0 0 0 3px rgba(99,102,241,0.12)"; }}
      onBlur={e=>{ e.target.style.borderColor=DS.border; e.target.style.boxShadow="none"; }}
    />
  );
}
function Btn({ children, onClick, color, outline }) {
  return (
    <button onClick={onClick} style={{ padding:"10px 18px", borderRadius:8, border:outline?`1.5px solid ${color}`:"none",
      background:outline?"white":color, color:outline?color:"white", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", letterSpacing:0.2 }}>
      {children}
    </button>
  );
}
