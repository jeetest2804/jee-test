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
app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  res.setTimeout(180_000, () => {
    res.status(503).json({ error: "Server timeout — PDF may be too large. Try a smaller file." });
  });
  next();
});

/* ── Serve built frontend ── */
const distPath = join(__dirname, "dist");
app.use(express.static(distPath));

/* ══════════════════════════════════════════════════════════════════
   PERMANENT FIX: Dynamic model discovery

   Instead of hardcoding model names (which break when Google
   retires them), we call Google's /v1beta/models endpoint at startup
   to discover which models are actually available RIGHT NOW.

   Cached for 1 hour. Auto-invalidated on any 404 response.
   This means the app AUTOMATICALLY adapts — no code changes needed.
══════════════════════════════════════════════════════════════════ */

const PREFERRED_ORDER = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-exp",
];

let cachedModels = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getAvailableModels(apiKey) {
  const now = Date.now();
  if (cachedModels && (now - cacheTime) < CACHE_TTL) return cachedModels;

  try {
    console.log("[Models] Fetching live model list from Google...");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const available = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    // Sort by preference, then append any new models Google adds
    const sorted = [
      ...PREFERRED_ORDER.filter(m => available.includes(m)),
      ...available.filter(m => !PREFERRED_ORDER.includes(m) && m.startsWith("gemini")),
    ];

    cachedModels = sorted.length > 0 ? sorted : PREFERRED_ORDER;
    cacheTime = now;
    console.log(`[Models] Live list: ${cachedModels.join(", ")}`);
    return cachedModels;
  } catch (err) {
    console.error("[Models] Could not fetch list:", err.message, "— using defaults");
    return PREFERRED_ORDER;
  }
}

/* ── /api/models — frontend can query what's available ── */
app.get("/api/models", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key" });
  const models = await getAvailableModels(apiKey);
  res.json({ models });
});

/* ══════════════════════════════════════════════════════
   /api/parse-pdf  — Gemini AI PDF parsing
══════════════════════════════════════════════════════ */
app.post("/api/parse-pdf", async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not set. Add it in Render → Environment → Environment Variables.",
    });
  }

  const { base64, isKey, model: requestedModel } = req.body;
  if (!base64) return res.status(400).json({ error: "Missing base64 PDF data" });

  const prompt = isKey
    ? `Extract answer key from this JEE PDF. Return ONLY valid JSON — no markdown:
{"answers":[{"q":1,"correct":1,"type":"mcq"},{"q":2,"correct":24,"type":"integer"},...]}
- For MCQ: correct is 0-based index (0=A,1=B,2=C,3=D). For integer: correct is the number.`
    : `Extract ALL questions from this JEE exam PDF. Return ONLY valid JSON — no markdown:
{"questions":[{"id":1,"subject":"Physics","type":"mcq","text":"...","options":["opt1","opt2","opt3","opt4"],"correct":2,"marks":4,"negative":-1}]}
- subject: "Physics", "Chemistry", or "Mathematics" only
- type: "mcq" for 4-option, "integer" for numeric (set options=[])
- correct: 0-based index for MCQ, numeric value for integer
- NO "A)" "B)" prefixes in options text
- Extract EVERY question. Output pure JSON only.`;

  // Get live model list, try requested model first
  const allModels = await getAvailableModels(geminiApiKey);
  const models = requestedModel && allModels.includes(requestedModel)
    ? [requestedModel, ...allModels.filter(m => m !== requestedModel)]
    : allModels;

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[Gemini] Trying: ${model}`);
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: "application/pdf", data: base64 } },
              { text: prompt },
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        lastError = `Gemini ${model} HTTP ${geminiRes.status}: ${errBody}`;
        console.error(`[Gemini] ${lastError}`);
        if (geminiRes.status === 404) {
          console.log(`[Models] ${model} is gone — invalidating cache`);
          cachedModels = null; // Force re-discovery on next request
        }
        continue;
      }

      const data = await geminiRes.json();
      let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!txt) {
        lastError = `${model} returned empty. finishReason=${data.candidates?.[0]?.finishReason}`;
        console.error(`[Gemini] ${lastError}`);
        continue;
      }

      txt = txt.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      const start = txt.indexOf("{");
      const end = txt.lastIndexOf("}");
      if (start === -1 || end === -1) {
        lastError = `${model}: no JSON found`;
        continue;
      }

      let parsed;
      try { parsed = JSON.parse(txt.slice(start, end + 1)); }
      catch (e) { lastError = `${model}: JSON parse failed — ${e.message}`; continue; }

      if (!isKey && (!parsed.questions?.length)) { lastError = `${model}: questions empty`; continue; }
      if (isKey && (!parsed.answers?.length)) { lastError = `${model}: answers empty`; continue; }

      const count = isKey ? parsed.answers.length : parsed.questions.length;
      console.log(`[Gemini] ✅ ${model} succeeded! Items: ${count}`);
      return res.status(200).json({ ok: true, data: parsed, modelUsed: model });

    } catch (err) {
      lastError = `Fetch error for ${model}: ${err.message}`;
      console.error(`[Gemini] ${lastError}`);
      continue;
    }
  }

  return res.status(502).json({ error: lastError || "All models failed." });
});

/* ── Catch-all: serve React app ── */
app.get("*", (req, res) => {
  const indexPath = join(distPath, "index.html");
  existsSync(indexPath)
    ? res.sendFile(indexPath)
    : res.status(404).send("App not built yet. Run: npm run build");
});

// Bind 0.0.0.0 — required for Render to detect the open port
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ TestForge server running on port ${PORT}`);
  if (process.env.GEMINI_API_KEY) {
    getAvailableModels(process.env.GEMINI_API_KEY)
      .then(m => console.log(`[Models] Ready. Will try: ${m[0]} first`))
      .catch(() => {});
  }
});
