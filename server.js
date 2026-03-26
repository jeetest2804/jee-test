import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use((req, res, next) => {
  res.setTimeout(600_000, () => res.status(503).json({ error: "Server timeout." }));
  next();
});

const distPath = join(__dirname, "dist");
app.use(express.static(distPath));

/* ══════════════════════════════════════════
   DYNAMIC MODEL DISCOVERY
══════════════════════════════════════════ */
const PREFERRED_ORDER = [
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

let cachedModels = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000;

async function getAvailableModels(apiKey) {
  const now = Date.now();
  if (cachedModels && (now - cacheTime) < CACHE_TTL) return cachedModels;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const available = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));
    const sorted = [
      ...PREFERRED_ORDER.filter(m => available.includes(m)),
      ...available.filter(m => !PREFERRED_ORDER.includes(m) && m.startsWith("gemini")),
    ];
    cachedModels = sorted.length > 0 ? sorted : PREFERRED_ORDER;
    cacheTime = now;
    return cachedModels;
  } catch (err) {
    console.error("[Models] Fetch failed:", err.message);
    return PREFERRED_ORDER;
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/models", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key" });
  res.json({ models: await getAvailableModels(apiKey) });
});

/* ══════════════════════════════════════════════════════════════════
   PDF PAGE → BASE64 PNG IMAGE
   Renders a specific PDF page using pdftoppm (poppler-utils).
   Returns base64 PNG string, or null if it fails.
══════════════════════════════════════════════════════════════════ */
const tmpDir = "/tmp/jee-pdf-pages";
mkdirSync(tmpDir, { recursive: true });

async function pdfPageToBase64(pdfBase64, pageNumber) {
  if (!pageNumber || pageNumber < 1) return null;
  const sessionId = randomUUID();
  const pdfPath = join(tmpDir, `${sessionId}.pdf`);
  const outPrefix = join(tmpDir, sessionId);

  try {
    writeFileSync(pdfPath, Buffer.from(pdfBase64, "base64"));

    const pg = String(pageNumber);
    execSync(
      `pdftoppm -r 150 -f ${pg} -l ${pg} -png "${pdfPath}" "${outPrefix}"`,
      { timeout: 30000, stdio: "pipe" }
    );

    // Find the output file (pdftoppm uses zero-padded names)
    const padded = String(pageNumber).padStart(6, "0");
    let imgPath = `${outPrefix}-${padded}.png`;

    if (!existsSync(imgPath)) {
      // Try other padding lengths
      for (let pad = 1; pad <= 5; pad++) {
        const alt = `${outPrefix}-${String(pageNumber).padStart(pad, "0")}.png`;
        if (existsSync(alt)) { imgPath = alt; break; }
      }
    }

    if (!existsSync(imgPath)) return null;

    const data = readFileSync(imgPath).toString("base64");
    unlinkSync(imgPath);
    return data;
  } catch (err) {
    console.error(`[PDF2Img] Page ${pageNumber} failed:`, err.message);
    return null;
  } finally {
    try { unlinkSync(pdfPath); } catch {}
  }
}

/* /api/page-image — render one PDF page to PNG */
app.post("/api/page-image", async (req, res) => {
  const { base64, page } = req.body;
  if (!base64 || !page) return res.status(400).json({ error: "Missing base64 or page" });
  const image = await pdfPageToBase64(base64, page);
  if (!image) return res.status(500).json({ error: "Could not render PDF page. Is poppler-utils installed?" });
  return res.json({ ok: true, image, page });
});

/* ══════════════════════════════════════════════════════════════════
   CORE: Call Gemini with a prompt + PDF base64
══════════════════════════════════════════════════════════════════ */
async function callGemini(apiKey, model, base64, promptText) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: "application/pdf", data: base64 } },
          { text: promptText },
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 32768 },
      }),
    }
  );
  if (!res.ok) { const b = await res.text(); const e = new Error(`HTTP ${res.status}: ${b}`); e.status = res.status; throw e; }
  const data = await res.json();
  let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!txt) throw new Error(`Empty response. finishReason=${data.candidates?.[0]?.finishReason}`);
  txt = txt.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
  const start = txt.indexOf("{"), end = txt.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  return JSON.parse(txt.slice(start, end + 1));
}

async function callGeminiWithFallback(apiKey, models, base64, promptText, validate) {
  let lastError = null;
  for (const model of models) {
    try {
      const parsed = await callGemini(apiKey, model, base64, promptText);
      if (validate && !validate(parsed)) { lastError = `${model}: validation failed`; continue; }
      console.log(`[Gemini] ✅ ${model} succeeded`);
      return { parsed, model };
    } catch (err) {
      lastError = `${model}: ${err.message}`;
      if (err.status === 404) cachedModels = null;
    }
  }
  throw new Error(lastError || "All models failed");
}

/* ══════════════════════════════════════════════════════════════════
   BUILD PROMPTS
   
   KEY CHANGE: Ask Gemini to return figurePageNumber for each 
   question with a figure. Frontend uses this to fetch the actual
   PDF page image — no more re-drawing diagrams from descriptions!
══════════════════════════════════════════════════════════════════ */
function buildSubjectPrompt(subject, startId) {
  return `You are extracting ONLY the ${subject} questions from this JEE exam PDF.
Focus exclusively on ${subject} questions. Question IDs start from ${startId}.

FIGURE HANDLING — THIS IS CRITICAL:
When a question or its options contain a diagram, graph, circuit, or any visual figure:
- Set "hasFigure": true
- Set "figurePageNumber": the PDF page number (integer) where the figure appears
- In the question "text", write [FIGURE] as a placeholder at the position of the diagram
- For MCQ options that are themselves diagrams (e.g. "which graph is correct?"):
  write "[FIGURE_A]", "[FIGURE_B]", "[FIGURE_C]", "[FIGURE_D]" in the options array
- Do NOT describe the diagram in words — just mark the page number

Example (figure in question body):
{"id":5,"subject":"${subject}","type":"mcq","text":"A block of mass 2kg is placed as shown. [FIGURE] Find the normal force.","options":["10N","20N","15N","25N"],"correct":1,"marks":4,"negative":-1,"hasFigure":true,"figurePageNumber":4}

Example (options are graphs/diagrams):
{"id":8,"subject":"${subject}","type":"mcq","text":"The velocity-time graph for the given motion is:","options":["[FIGURE_A]","[FIGURE_B]","[FIGURE_C]","[FIGURE_D]"],"correct":2,"marks":4,"negative":-1,"hasFigure":true,"figurePageNumber":6}

Return ONLY valid JSON:
{"questions":[
{"id":${startId},"subject":"${subject}","type":"mcq","text":"question text","options":["A","B","C","D"],"correct":0,"marks":4,"negative":-1,"hasFigure":false,"figurePageNumber":null}
]}

RULES:
- subject: EXACTLY "${subject}"
- type: "mcq" for 4-option questions, "integer" for numeric answer
- options: 4 strings for MCQ (never empty), [] for integer
- correct: 0-based index for MCQ (0=A,1=B,2=C,3=D), actual integer for integer type
- marks: 4, negative: -1 for MCQ, 0 for integer
- hasFigure: true only when question has an actual visual element (not just symbols)
- figurePageNumber: exact PDF page number as integer, or null
- Extract EVERY ${subject} question — do not skip any
- Output ONLY the JSON object, no markdown`;
}

function buildAnswerKeyPrompt() {
  return `Extract the complete answer key from this JEE PDF.
Return ONLY valid JSON — no markdown:
{"answers":[{"q":1,"correct":1,"type":"mcq"},{"q":2,"correct":24,"type":"integer"},...]}
- q = question number
- MCQ: correct = 0-based index (0=A, 1=B, 2=C, 3=D)
- integer: correct = the numeric answer
- Include ALL questions. Output ONLY JSON.`;
}

function buildFullPrompt() {
  return `Extract ALL questions from this JEE exam PDF. Do not stop early. Full JEE = 75-90 questions.

FIGURE HANDLING:
- hasFigure: true when a visual diagram/graph/figure is present
- figurePageNumber: exact PDF page number (integer) where the figure is
- In text: write [FIGURE] where the diagram appears
- Options that are diagrams: write "[FIGURE_A]","[FIGURE_B]","[FIGURE_C]","[FIGURE_D]"
- Do NOT describe figures in words

Return ONLY valid JSON:
{"questions":[
{"id":1,"subject":"Physics","type":"mcq","text":"text [FIGURE]","options":["A","B","C","D"],"correct":0,"marks":4,"negative":-1,"hasFigure":true,"figurePageNumber":3},
{"id":2,"subject":"Chemistry","type":"integer","text":"text","options":[],"correct":5,"marks":4,"negative":0,"hasFigure":false,"figurePageNumber":null}
]}
- subject: "Physics", "Chemistry", or "Mathematics" exactly
- Extract ALL questions. Output ONLY JSON.`;
}

/* ══════════════════════════════════════════════════════════════════
   /api/parse-pdf  — main endpoint
══════════════════════════════════════════════════════════════════ */
app.post("/api/parse-pdf", async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) return res.status(500).json({ error: "GEMINI_API_KEY is not set." });

  const { base64, isKey, model: requestedModel } = req.body;
  if (!base64) return res.status(400).json({ error: "Missing base64 PDF data" });

  const allModels = await getAvailableModels(geminiApiKey);
  const models = requestedModel && allModels.includes(requestedModel)
    ? [requestedModel, ...allModels.filter(m => m !== requestedModel)]
    : allModels;

  if (isKey) {
    try {
      const { parsed, model } = await callGeminiWithFallback(
        geminiApiKey, models, base64, buildAnswerKeyPrompt(),
        p => Array.isArray(p.answers) && p.answers.length > 0
      );
      return res.status(200).json({ ok: true, data: parsed, modelUsed: model });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  const subjects = ["Physics", "Chemistry", "Mathematics"];
  const startIds = { Physics: 1, Chemistry: 31, Mathematics: 61 };

  const subjectResults = await Promise.allSettled(
    subjects.map(async (subject) => {
      const { parsed } = await callGeminiWithFallback(
        geminiApiKey, models, base64,
        buildSubjectPrompt(subject, startIds[subject]),
        p => Array.isArray(p.questions) && p.questions.length > 0
      );
      return parsed.questions.map(q => ({ ...q, subject }));
    })
  );

  const allQuestions = [];
  const failures = [];
  subjectResults.forEach((r, i) => {
    if (r.status === "fulfilled") allQuestions.push(...r.value);
    else failures.push(subjects[i]);
  });

  if (allQuestions.length > 0) {
    allQuestions.sort((a, b) => (a.id || 0) - (b.id || 0));
    const numbered = allQuestions.map((q, i) => ({ ...q, id: i + 1 }));
    return res.status(200).json({
      ok: true, data: { questions: numbered }, modelUsed: "parallel",
      warning: failures.length > 0 ? `Could not extract ${failures.join(", ")} questions.` : null,
    });
  }

  try {
    const { parsed, model } = await callGeminiWithFallback(
      geminiApiKey, models, base64, buildFullPrompt(),
      p => Array.isArray(p.questions) && p.questions.length > 0
    );
    const numbered = parsed.questions.map((q, i) => ({ ...q, id: i + 1 }));
    return res.status(200).json({ ok: true, data: { questions: numbered }, modelUsed: model });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.get("*", (req, res) => {
  const indexPath = join(distPath, "index.html");
  existsSync(indexPath) ? res.sendFile(indexPath) : res.status(404).send("Not built yet.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ TestForge server on port ${PORT}`);
  try { execSync("which pdftoppm", { stdio: "pipe" }); console.log("✅ pdftoppm found — real diagram images enabled"); }
  catch { console.warn("⚠️  Install poppler-utils: apt-get install -y poppler-utils"); }
});
