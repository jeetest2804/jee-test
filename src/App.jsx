import { useState, useEffect, useRef } from "react";

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
      onStart={(test) => { setActiveTest(test); setPage("test"); }}
      onLogout={doLogout} serverReady={serverReady} />
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
  const [statusType, setStatusType] = useState("info"); // "info" | "error" | "success" | "warning"
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [studentPasswords, setStudentPasswords] = useState([]);
  const [newSP, setNewSP] = useState({ name:"", username:"", password:"" });
  const [spMsg, setSpMsg] = useState("");
  const [savedDriveKey, setSavedDriveKey] = useState("");
  const [savedModel, setSavedModel] = useState("gemini-2.0-flash");
  const paperRef = useRef(); const keyRef = useRef();

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

  const createTest = async () => {
    if (!form.title.trim()) { setMsg("Enter a test title", "error"); return; }

    setLoading(true);
    setMsg("Starting...", "info");

    let questions = null;
    let geminiUsed = false;

    try {
      if (form.mode === "upload") {
        if (paperFile) {
          setMsg("📄 Converting PDF to base64...", "info");
          const b64 = await toBase64(paperFile);
          setMsg("🤖 Sending to Gemini AI to extract questions... (may take up to 60s for large PDFs)", "info");
          try {
            const res = await parsePDF(b64, false, savedModel);
            if (res?.questions?.length) {
              // Normalize questions — fix type mismatches from Gemini
              questions = res.questions.map((q, idx) => {
                let type = q.type;
                // If options array is empty or missing, it must be integer type
                if (!q.options || q.options.length === 0) type = "integer";
                // If options has items, it must be mcq
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
              setMsg(`✅ Gemini extracted ${questions.length} questions!`, "success");
            } else {
              setMsg("❌ Gemini returned 0 questions. The PDF may be scanned/image-based or formatted unusually. Check Render logs for details.", "error");
              setLoading(false);
              return;
            }
          } catch (geminiErr) {
            setMsg(`❌ Gemini failed: ${geminiErr.message}`, "error");
            setLoading(false);
            return;
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
        setMsg("🤖 Sending to Gemini AI... (may take up to 60s for large PDFs)", "info");
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
              🤖 Gemini AI will automatically extract questions from your PDF — no API key needed here, it's configured on the server.
            </p>

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

            <div style={{ marginTop:24 }}>
              <Label>Schedule Date and Time (leave blank for immediate)</Label>
              <input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm(f=>({...f,scheduledAt:e.target.value}))}
                style={{ padding:"11px 14px", borderRadius:10, border:"1px solid #ddd", fontSize:14, outline:"none", fontFamily:"inherit", background:"#fafafa" }} />
            </div>

            <div style={{ marginTop:24 }}>
              <Label>How to load the question paper?</Label>
              <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap" }}>
                {[["upload","📄 Upload PDF"],["drive","📁 Google Drive"],["demo","🎯 Use Demo Questions"]].map(([val,lbl])=>(
                  <button key={val} onClick={()=>setForm(f=>({...f,mode:val}))}
                    style={{ padding:"10px 20px", borderRadius:10, border:`2px solid ${form.mode===val?"#e8c97e":"#e0e0e0"}`,
                      background:form.mode===val?"#fffde7":"white", color:form.mode===val?"#7c6a00":"#888",
                      fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Gemini info banner — no key input needed */}
            {(form.mode === "upload" || form.mode === "drive") && (
              <div style={{ marginTop:20, borderRadius:12, padding:16, border:"1px solid #c8e6c9", background:"#e8f5e9", display:"flex", alignItems:"flex-start", gap:12 }}>
                <span style={{ fontSize:24 }}>🤖</span>
                <div>
                  <div style={{ fontWeight:700, color:"#2e7d32", fontSize:14 }}>AI is ready</div>
                  <div style={{ fontSize:12, color:"#555", marginTop:3 }}>
                    Questions will be extracted automatically using the Gemini API key configured on your server (Render environment variable). You don't need to enter anything here.
                  </div>
                </div>
              </div>
            )}

            {form.mode === "upload" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:20 }}>
                {[["Question Paper PDF", paperRef, paperFile, setPaperFile],["Answer Key PDF (optional)", keyRef, keyFile, setKeyFile]].map(([lbl,ref,file,setter])=>(
                  <div key={lbl}>
                    <Label>{lbl}</Label>
                    <div onClick={()=>ref.current.click()} style={{ border:"2px dashed #d0d0d0", borderRadius:12, padding:20, textAlign:"center", cursor:"pointer", background:file?"#f0fdf4":"#fafafa" }}>
                      <input type="file" accept=".pdf" ref={ref} style={{ display:"none" }} onChange={e=>setter(e.target.files[0])} />
                      {file ? <div style={{ color:"#2e7d32", fontSize:13, fontWeight:600 }}>✅ {file.name}</div>
                             : <div style={{ color:"#bbb", fontSize:13 }}>Click to upload PDF</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {form.mode === "drive" && (
              <div style={{ marginTop:20, background:"#f8f9ff", borderRadius:14, padding:20, border:"1px solid #e8eaf6" }}>
                <div style={{ fontWeight:700, color:"#3949ab", marginBottom:14, fontSize:14 }}>Google Drive Settings</div>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {form.driveApiKey ? (
                    <div style={{ background:"#e8f5e9", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
                      <span>✅</span>
                      <div style={{ fontSize:13, color:"#2e7d32", fontWeight:700 }}>Drive API Key loaded from Settings</div>
                    </div>
                  ) : (
                    <div>
                      <Label>Google Drive API Key</Label>
                      <Input value={form.driveApiKey} onChange={v=>setForm(f=>({...f,driveApiKey:v}))} placeholder="AIzaSy... — or save permanently in ⚙️ Settings" />
                    </div>
                  )}
                  <div>
                    <Label>Question Paper Google Drive File ID</Label>
                    <Input value={form.drivePaperFileId} onChange={v=>setForm(f=>({...f,drivePaperFileId:v}))} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs..." />
                  </div>
                  <div>
                    <Label>Answer Key Google Drive File ID (optional)</Label>
                    <Input value={form.driveKeyFileId} onChange={v=>setForm(f=>({...f,driveKeyFileId:v}))} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs..." />
                  </div>
                </div>
              </div>
            )}

            {form.mode === "demo" && (
              <div style={{ marginTop:16, background:"#e8f5e9", borderRadius:12, padding:16, fontSize:13, color:"#2e7d32", border:"1px solid #a5d6a7" }}>
                Will use 9 sample JEE questions (3 Physics, 3 Chemistry, 3 Mathematics)
              </div>
            )}

            {status && (
              <div style={{ marginTop:16, padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600, ...statusBannerStyle[statusType] }}>
                {status}
              </div>
            )}

            <div style={{ display:"flex", gap:12, marginTop:24 }}>
              <button onClick={()=>{ setView("dashboard"); setStatus(""); }} style={{ padding:"13px 24px", borderRadius:12, border:"2px solid #e0e0e0", background:"white", color:"#555", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              <button onClick={createTest} disabled={loading}
                style={{ flex:1, padding:"13px", borderRadius:12, border:"none", background:loading?"#ccc":"linear-gradient(135deg,#1a1a2e,#3949ab)", color:"white", fontWeight:800, cursor:loading?"default":"pointer", fontSize:15, fontFamily:"inherit" }}>
                {loading ? "Processing..." : "Create Test"}
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
function StudentScreen({ user, tests, onStart, onLogout, serverReady }) {
  const available = tests.filter(t => getTestStatus(t) === TEST_STATUS.LIVE);
  const upcoming = tests.filter(t => getTestStatus(t) === TEST_STATUS.SCHEDULED);
  const ended = tests.filter(t => getTestStatus(t) === TEST_STATUS.ENDED);
  const [submittedIds, setSubmittedIds] = useState(new Set());

  useEffect(() => {
    (async () => {
      const allResults = await dbGet("all-results") || {};
      const ids = new Set(
        Object.keys(allResults)
          .filter(k => k.endsWith("__" + user.name))
          .map(k => k.replace("__" + user.name, ""))
      );
      setSubmittedIds(ids);
    })();
  }, [user.name]);

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
                  ? <span style={{ padding:"10px 18px", borderRadius:10, background:"#e8f5e9", color:"#2e7d32", fontWeight:700, fontSize:13 }}>✅ Submitted</span>
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
              action={<span style={{ color:"#888", fontSize:13 }}>Test ended</span>} />
          ))}
        </Section>
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
              <p style={{ fontSize:15, lineHeight:2, color:"#212121", margin:0, fontFamily:"Georgia, serif" }}>
                {renderMath(cur.text)}
              </p>
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
                        {renderMath(opt)}
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
                  <p style={{ margin:"12px 0 14px", fontSize:13, lineHeight:1.75, whiteSpace:"pre-wrap" }}>{renderMath(r.text)}</p>
                  {r.type==="mcq" ? r.options.map((opt,oi)=>(
                    <div key={oi} style={{ padding:"8px 12px", borderRadius:8, marginBottom:6, fontSize:13,
                      background:String(r.correct)===String(oi)?"#c8e6c9":String(r.given)===String(oi)?"#ffcdd2":"white",
                      border:`1px solid ${String(r.correct)===String(oi)?"#81c784":"#e0e0e0"}`,
                      fontWeight:String(r.correct)===String(oi)?700:400 }}>
                      {["A","B","C","D"][oi]}) {renderMath(opt)}
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
