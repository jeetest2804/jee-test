import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "100mb" }));

app.use((req, res, next) => {
  res.setTimeout(600_000, () => {
    res.status(503).json({ error: "Server timeout." });
  });
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
    console.log(`[Models] List: ${cachedModels.slice(0, 3).join(", ")} ...`);
    return cachedModels;
  } catch (err) {
    console.error("[Models] Fetch failed:", err.message, "— using defaults");
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
   CORE: Call Gemini with a prompt + PDF base64
   Returns parsed JSON or throws
══════════════════════════════════════════════════════════════════ */
async function callGemini(apiKey, model, base64, promptText) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: "application/pdf", data: base64 } },
            { text: promptText },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 32768 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`HTTP ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!txt) {
    throw new Error(`Empty response. finishReason=${data.candidates?.[0]?.finishReason}`);
  }

  // Strip markdown fences
  txt = txt.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // Extract outermost JSON object
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");

  return JSON.parse(txt.slice(start, end + 1));
}

/* ══════════════════════════════════════════════════════════════════
   Try callGemini across all available models, return first success
══════════════════════════════════════════════════════════════════ */
async function callGeminiWithFallback(apiKey, models, base64, promptText, validate) {
  let lastError = null;
  for (const model of models) {
    try {
      console.log(`[Gemini] Trying ${model}...`);
      const parsed = await callGemini(apiKey, model, base64, promptText);
      if (validate && !validate(parsed)) {
        lastError = `${model}: validation failed`;
        console.error(`[Gemini] ${lastError}`);
        continue;
      }
      console.log(`[Gemini] ✅ ${model} succeeded`);
      return { parsed, model };
    } catch (err) {
      lastError = `${model}: ${err.message}`;
      console.error(`[Gemini] ${lastError}`);
      if (err.status === 404) cachedModels = null; // Invalidate cache
      continue;
    }
  }
  throw new Error(lastError || "All models failed");
}

/* ══════════════════════════════════════════════════════════════════
   BUILD PROMPTS
══════════════════════════════════════════════════════════════════ */
function buildSubjectPrompt(subject, startId) {
  return `You are extracting ONLY the ${subject} questions from this JEE exam PDF.

Focus exclusively on ${subject} questions. Ignore other subjects.
Question IDs start from ${startId} and must be sequential.

CRITICAL DIAGRAM RULES — read carefully:

1. QUESTION DIAGRAMS: If the question itself has a figure/diagram, embed it in "text" using [FIGURE: description].
   Example: "text": "Two blocks on a surface. [FIGURE: Two blocks A(3kg) and B(5kg) on horizontal surface. Force F1=50N pushes A from left. F2=18N pushes B from right. A and B are in contact.]"

2. OPTION DIAGRAMS — THIS IS THE MOST IMPORTANT RULE:
   When each option IS a graph or diagram (like "which graph shows the a-t relationship?"),
   you MUST include a [FIGURE: description] tag INSIDE each option string.
   NEVER put just "(A)", "(B)", "(C)", "(D)" as option text.
   
   WRONG: "options":["(A)","(B)","(C)","(D)"]
   CORRECT: "options":[
     "[FIGURE: a-t graph. Zero from t=0 to t0, then curves upward as parabola]",
     "[FIGURE: a-t graph. Zero from t=0 to t0, then jumps up and increases linearly]",
     "[FIGURE: a-t graph. Zero from t=0 to t0, then increases linearly from origin]",
     "[FIGURE: a-t graph. Zero from t=0 to t0, then jumps to constant value]"
   ]

3. For graph descriptions be PRECISE about shape:
   - "increases linearly" = straight diagonal line going up
   - "parabola/concave up" = curved line bending upward  
   - "constant" = horizontal flat line
   - "jumps" = vertical step up
   - "drops to zero" = vertical line going down to x-axis
   Always mention: starting point, any flat/zero region, transitions, end behavior.
   Always mention axis labels (a-t graph, v-t graph, F-t graph, etc.)

4. For physics diagrams describe: object shapes, labels, forces with arrows and values, connections.

Return ONLY valid JSON — no markdown, no explanation:
{"questions":[
{"id":${startId},"subject":"${subject}","type":"mcq","text":"question text [FIGURE: desc if diagram in question]","options":["option A text or [FIGURE: desc]","option B or [FIGURE: desc]","option C or [FIGURE: desc]","option D or [FIGURE: desc]"],"correct":2,"marks":4,"negative":-1,"hasFigure":false},
{"id":${startId+1},"subject":"${subject}","type":"integer","text":"full question text","options":[],"correct":5,"marks":4,"negative":0,"hasFigure":false}
]}

RULES:
- subject: EXACTLY "${subject}"
- type: "mcq" for 4-option, "integer" for numeric answer
- options: 4 strings for MCQ — NEVER empty "(A)" labels, always real text or [FIGURE:...], empty [] for integer
- correct: 0-based index for MCQ (0=A,1=B,2=C,3=D), actual number for integer
- marks: 4, negative: -1 for MCQ / 0 for integer
- hasFigure: true if question or any option has a diagram
- Extract EVERY ${subject} question — do not skip any
- Output ONLY the JSON object`;
}

function buildAnswerKeyPrompt() {
  return `Extract the complete answer key from this JEE PDF.
Return ONLY valid JSON — no markdown:
{"answers":[{"q":1,"correct":1,"type":"mcq"},{"q":2,"correct":24,"type":"integer"},...]}
- q = question number
- For MCQ: correct = 0-based index (0=A, 1=B, 2=C, 3=D)
- For integer: correct = the numeric answer
- Include ALL questions. Output ONLY JSON.`;
}

function buildFullPrompt() {
  return `You are extracting ALL questions from a JEE exam PDF. Extract EVERY question — do not stop early.
A full JEE paper has 75-90 questions across Physics, Chemistry, Mathematics.

CRITICAL DIAGRAM RULES:
1. QUESTION DIAGRAMS: embed in "text" as [FIGURE: detailed description of what the diagram shows]
2. OPTION DIAGRAMS: When options ARE graphs/diagrams, put [FIGURE: description] INSIDE each option string.
   WRONG: "options":["(A)","(B)","(C)","(D)"]
   CORRECT: "options":["[FIGURE: a-t graph showing zero then parabola curve up]","[FIGURE: a-t graph showing zero then linear increase after jump]","[FIGURE: ...]","[FIGURE: ...]"]
   For graph descriptions: state axis labels, starting value, shape (linear/parabola/constant/step), transitions.
   NEVER use empty option labels when options contain graphs.

Return ONLY valid JSON:
{"questions":[
{"id":1,"subject":"Physics","type":"mcq","text":"full text [FIGURE: desc if diagram in question]","options":["option A or [FIGURE: desc]","option B or [FIGURE: desc]","option C or [FIGURE: desc]","option D or [FIGURE: desc]"],"correct":2,"marks":4,"negative":-1,"hasFigure":false},
{"id":2,"subject":"Physics","type":"integer","text":"full text","options":[],"correct":5,"marks":4,"negative":0,"hasFigure":false}
]}
RULES:
- subject: EXACTLY "Physics", "Chemistry", or "Mathematics"
- type: "mcq" or "integer"
- options: 4 real strings for MCQ (never just "(A)"), [] for integer
- correct: 0-based for MCQ, actual number for integer
- Extract ALL questions. Output ONLY JSON.`;
}

/* ══════════════════════════════════════════════════════════════════
   /api/parse-pdf  — main endpoint
   
   Strategy for questions (isKey=false):
   1. Try PARALLEL extraction — send 3 simultaneous requests for
      Physics, Chemistry, Maths separately (each ~25 questions)
   2. Merge results, re-number IDs sequentially
   3. If parallel fails, fall back to single full-paper extraction
   
   For answer key (isKey=true): single call as before
══════════════════════════════════════════════════════════════════ */
app.post("/api/parse-pdf", async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not set. Add it in Render → Environment → Environment Variables.",
    });
  }

  const { base64, isKey, model: requestedModel } = req.body;
  if (!base64) return res.status(400).json({ error: "Missing base64 PDF data" });

  const allModels = await getAvailableModels(geminiApiKey);
  const models = requestedModel && allModels.includes(requestedModel)
    ? [requestedModel, ...allModels.filter(m => m !== requestedModel)]
    : allModels;

  /* ── ANSWER KEY: single call ── */
  if (isKey) {
    try {
      const { parsed, model } = await callGeminiWithFallback(
        geminiApiKey, models, base64,
        buildAnswerKeyPrompt(),
        p => Array.isArray(p.answers) && p.answers.length > 0
      );
      console.log(`[AnswerKey] ✅ Extracted ${parsed.answers.length} answers`);
      return res.status(200).json({ ok: true, data: parsed, modelUsed: model });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  /* ── QUESTIONS: parallel subject extraction ── */
  const subjects = ["Physics", "Chemistry", "Mathematics"];
  // Starting IDs: Physics 1-30, Chemistry 31-60, Maths 61-90
  const startIds = { Physics: 1, Chemistry: 31, Mathematics: 61 };

  console.log(`[Questions] Starting parallel extraction for all 3 subjects...`);

  // Run all 3 subjects simultaneously
  const subjectResults = await Promise.allSettled(
    subjects.map(async (subject) => {
      const prompt = buildSubjectPrompt(subject, startIds[subject]);
      const { parsed } = await callGeminiWithFallback(
        geminiApiKey, models, base64, prompt,
        p => Array.isArray(p.questions) && p.questions.length > 0
      );
      const qs = parsed.questions.map(q => ({ ...q, subject }));
      console.log(`[Questions] ${subject}: extracted ${qs.length} questions`);
      return qs;
    })
  );

  // Collect successful results
  const allQuestions = [];
  const failures = [];

  subjectResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      allQuestions.push(...result.value);
    } else {
      failures.push(subjects[i]);
      console.error(`[Questions] ${subjects[i]} failed:`, result.reason?.message);
    }
  });

  // If parallel worked for at least some subjects
  if (allQuestions.length > 0) {
    // Sort by id and re-number sequentially
    allQuestions.sort((a, b) => (a.id || 0) - (b.id || 0));
    const numbered = allQuestions.map((q, i) => ({ ...q, id: i + 1 }));

    console.log(`[Questions] ✅ Parallel extraction done: ${numbered.length} total questions`);
    if (failures.length > 0) {
      console.warn(`[Questions] ⚠️ Failed subjects: ${failures.join(", ")}`);
    }

    return res.status(200).json({
      ok: true,
      data: { questions: numbered },
      modelUsed: "parallel",
      warning: failures.length > 0
        ? `Could not extract ${failures.join(", ")} questions. Try again.`
        : null,
    });
  }

  // All parallel calls failed — fall back to single full-paper extraction
  console.log("[Questions] Parallel failed, trying single full-paper extraction...");
  try {
    const { parsed, model } = await callGeminiWithFallback(
      geminiApiKey, models, base64,
      buildFullPrompt(),
      p => Array.isArray(p.questions) && p.questions.length > 0
    );
    const numbered = parsed.questions.map((q, i) => ({ ...q, id: i + 1 }));
    console.log(`[Questions] ✅ Fallback extraction: ${numbered.length} questions`);
    return res.status(200).json({ ok: true, data: { questions: numbered }, modelUsed: model });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

/* ── Catch-all: serve React app ── */
app.get("*", (req, res) => {
  const indexPath = join(distPath, "index.html");
  existsSync(indexPath)
    ? res.sendFile(indexPath)
    : res.status(404).send("App not built yet. Run: npm run build");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ TestForge server running on port ${PORT}`);
  if (process.env.GEMINI_API_KEY) {
    getAvailableModels(process.env.GEMINI_API_KEY)
      .then(m => console.log(`[Models] Ready. Will try: ${m[0]} first`))
      .catch(() => {});
  }
});
