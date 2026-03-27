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

/* ══════════════════════════════════════════
   API KEY ROTATION MANAGER
   Reads GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
   Automatically rotates to the next key on 429 (quota exceeded).
   Falls back to GEMINI_API_KEY_POOL=key1,key2,key3 format too.
══════════════════════════════════════════ */
const apiKeyManager = (() => {
  function loadKeys() {
    const keys = [];

    // Support GEMINI_API_KEY_POOL=key1,key2,key3 (comma-separated pool)
    if (process.env.GEMINI_API_KEY_POOL) {
      const poolKeys = process.env.GEMINI_API_KEY_POOL.split(",").map(k => k.trim()).filter(Boolean);
      keys.push(...poolKeys);
    }

    // Support GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ... (numbered)
    const numbered = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
    ].filter(Boolean);
    for (const k of numbered) {
      if (!keys.includes(k)) keys.push(k);
    }

    return keys;
  }

  const keys = loadKeys();
  let currentIndex = 0;
  // Track per-key quota exhaustion: key → timestamp when quota resets (or 0)
  const quotaExhaustedUntil = {};

  function getCurrent() {
    if (keys.length === 0) return null;
    // Find first key that is not quota-exhausted
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const idx = (currentIndex + attempt) % keys.length;
      const key = keys[idx];
      const exhaustedUntil = quotaExhaustedUntil[key] || 0;
      if (Date.now() >= exhaustedUntil) {
        currentIndex = idx;
        return key;
      }
    }
    // All keys are quota-exhausted — return least-recently-exhausted key
    const best = keys.reduce((a, b) =>
      (quotaExhaustedUntil[a] || 0) < (quotaExhaustedUntil[b] || 0) ? a : b
    );
    console.warn("[KeyManager] All keys quota-exhausted. Using least-recently-exhausted key.");
    return best;
  }

  function markQuotaExhausted(key) {
    // Cool-down: assume quota resets after 60 seconds (typical for Gemini free tier per-minute limit)
    const cooldownMs = 60 * 1000;
    quotaExhaustedUntil[key] = Date.now() + cooldownMs;
    console.warn(`[KeyManager] Key ...${key.slice(-6)} quota exhausted. Cooling down for ${cooldownMs / 1000}s.`);
    // Advance to next key immediately
    currentIndex = (currentIndex + 1) % keys.length;
  }

  function getNext() {
    if (keys.length <= 1) return getCurrent();
    currentIndex = (currentIndex + 1) % keys.length;
    return getCurrent();
  }

  function getStatus() {
    return {
      totalKeys: keys.length,
      currentKeyIndex: currentIndex,
      keyStatuses: keys.map((k, i) => ({
        index: i,
        suffix: `...${k.slice(-6)}`,
        isExhausted: Date.now() < (quotaExhaustedUntil[k] || 0),
        exhaustedUntil: quotaExhaustedUntil[k] ? new Date(quotaExhaustedUntil[k]).toISOString() : null,
      })),
    };
  }

  if (keys.length === 0) {
    console.warn("[KeyManager] ⚠️  No Gemini API keys found! Set GEMINI_API_KEY or GEMINI_API_KEY_POOL.");
  } else {
    console.log(`[KeyManager] ✅ Loaded ${keys.length} API key(s). Rotation enabled.`);
  }

  return { getCurrent, getNext, markQuotaExhausted, getStatus, get count() { return keys.length; } };
})();

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
  const key = apiKey || apiKeyManager.getCurrent();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
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

app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now(), keyManager: apiKeyManager.getStatus() }));
app.get("/api/key-status", (req, res) => res.json(apiKeyManager.getStatus()));
app.get("/api/models", async (req, res) => {
  const apiKey = apiKeyManager.getCurrent();
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

async function pdfPageToBase64(pdfBase64, pageNumber, cropRegion) {
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
      for (let pad = 1; pad <= 5; pad++) {
        const alt = `${outPrefix}-${String(pageNumber).padStart(pad, "0")}.png`;
        if (existsSync(alt)) { imgPath = alt; break; }
      }
    }

    if (!existsSync(imgPath)) return null;

    // If cropRegion provided, crop the image to the figure area
    if (cropRegion && cropRegion.top !== undefined && cropRegion.bottom !== undefined) {
      const croppedPath = `${outPrefix}-cropped.png`;
      try {
        // Get image dimensions
        const dimOut = execSync(`identify -format "%wx%h" "${imgPath}"`, { stdio: "pipe" }).toString().trim();
        const [imgW, imgH] = dimOut.split("x").map(Number);

        // Tight crop: 1% top padding (avoid pulling in question text), 3% elsewhere
        const topPad  = 1;
        const otherPad = 3;
        const topPct  = Math.max(0,   cropRegion.top    - topPad);
        const botPct  = Math.min(100, cropRegion.bottom + otherPad);
        const leftPct = Math.max(0,   (cropRegion.left  ?? 0)   - otherPad);
        const rightPct= Math.min(100, (cropRegion.right ?? 100) + otherPad);

        const cropX      = Math.round((leftPct           / 100) * imgW);
        const cropY      = Math.round((topPct            / 100) * imgH);
        const cropWidth  = Math.round(((rightPct - leftPct) / 100) * imgW);
        const cropHeight = Math.round(((botPct  - topPct ) / 100) * imgH);

        if (cropHeight > 10 && cropWidth > 10) {
          execSync(
            `convert "${imgPath}" -crop ${cropWidth}x${cropHeight}+${cropX}+${cropY} +repage "${croppedPath}"`,
            { timeout: 15000, stdio: "pipe" }
          );
          if (existsSync(croppedPath)) {
            const data = readFileSync(croppedPath).toString("base64");
            unlinkSync(croppedPath);
            unlinkSync(imgPath);
            return data;
          }
        }
      } catch (cropErr) {
        console.error(`[PDF2Img] Crop failed, returning full page:`, cropErr.message);
      }
    }

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

/* /api/page-image — render one PDF page to PNG, optionally cropped to figure region */
app.post("/api/page-image", async (req, res) => {
  const { base64, page, cropRegion } = req.body;
  if (!base64 || !page) return res.status(400).json({ error: "Missing base64 or page" });
  const image = await pdfPageToBase64(base64, page, cropRegion);
  if (!image) return res.status(500).json({ error: "Could not render PDF page. Is poppler-utils installed?" });
  return res.json({ ok: true, image, page });
});

/* /api/detect-figure-region — given a full-page PNG (base64) and a question text snippet,
   use Gemini vision to locate the figure and return {top, bottom, left, right} percentages.
   Falls back to null (no crop) if detection fails — caller decides what to do. */
app.post("/api/detect-figure-region", async (req, res) => {
  const { pageImageBase64, questionHint } = req.body;
  if (!pageImageBase64) return res.status(400).json({ error: "Missing pageImageBase64" });

  const geminiApiKey = apiKeyManager.getCurrent();
  if (!geminiApiKey) return res.json({ ok: true, region: null });

  const prompt = `This is a page from a JEE (Indian entrance exam) paper.${questionHint ? ` The question is about: "${questionHint}"` : ""}

Your task: find the TIGHT bounding box of ONLY the diagram, figure, or graph on this page. CRITICAL: Do NOT include question text, answer options, labels like "(A) (B)", captions, or any text above or below the diagram. The bounding box must start at the very top edge of the actual drawing/image, not the text.

Reply ONLY with a JSON object — no markdown, no explanation:
{"top": <integer 0-100>, "bottom": <integer 0-100>, "left": <integer 0-100>, "right": <integer 0-100>}

Where all values are percentages of page dimensions (0=top/left edge, 100=bottom/right edge).
- top/bottom: vertical position as % of page HEIGHT
- left/right: horizontal position as % of page WIDTH

Rules:
- Be as TIGHT as possible — crop to just the diagram itself
- If there are multiple figures, return the one most relevant to the question hint
- If there is truly NO figure/diagram on this page, reply with: {"top": null, "bottom": null, "left": null, "right": null}
- NEVER return top:0, bottom:100, left:0, right:100 — that means full page and is wrong`;

  try {
    const allModels = await getAvailableModels(geminiApiKey);
    const fastModels = allModels.filter(m =>
      m.includes("flash") || m.includes("2.0") || m.includes("1.5-flash")
    ).slice(0, 3);
    const modelsToTry = fastModels.length > 0 ? fastModels : allModels.slice(0, 2);

    for (const model of modelsToTry) {
      const maxKeyRotations = apiKeyManager.count;
      let keyRotations = 0;
      while (keyRotations <= maxKeyRotations) {
        const activeKey = apiKeyManager.getCurrent();
        try {
          const apiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inline_data: { mime_type: "image/png", data: pageImageBase64 } },
                    { text: prompt }
                  ]
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 80 }
              })
            }
          );

          if (!apiRes.ok) {
            const errText = await apiRes.text();
            if (apiRes.status === 429) {
              console.warn(`[DetectRegion] 429 on key ...${activeKey.slice(-6)} for ${model}. Rotating.`);
              apiKeyManager.markQuotaExhausted(activeKey);
              keyRotations++;
              continue;
            }
            throw new Error(`HTTP ${apiRes.status}: ${errText}`);
          }

          const data = await apiRes.json();
          const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const clean = raw.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);

          // If Gemini explicitly says no figure
          if (parsed.top === null || parsed.bottom === null) {
            console.log(`[DetectRegion] ${model} → no figure detected`);
            return res.json({ ok: true, region: null });
          }

          if (parsed.top !== undefined && parsed.bottom !== undefined) {
            const top    = Math.max(0,   Math.min(100, Number(parsed.top)));
            const bottom = Math.min(100, Math.max(0,   Number(parsed.bottom)));
            const left   = parsed.left  != null ? Math.max(0,   Math.min(100, Number(parsed.left)))  : 0;
            const right  = parsed.right != null ? Math.min(100, Math.max(0,   Number(parsed.right))) : 100;

            const heightCoverage = bottom - top;
            const widthCoverage  = right  - left;
            const isFullPage = heightCoverage > 90 && widthCoverage > 90;

            if (bottom > top + 5 && right > left + 5 && !isFullPage) {
              console.log(`[DetectRegion] ${model} → top:${top} bottom:${bottom} left:${left} right:${right}`);
              return res.json({ ok: true, region: { top, bottom, left, right } });
            }
          }
          break; // parsed OK but failed validation — try next model
        } catch (e) {
          console.error(`[DetectRegion] ${model} failed:`, e.message);
          break;
        }
      }
    }
  } catch (e) {
    console.error("[DetectRegion] outer error:", e.message);
  }

  // Detection failed — return null so the caller can handle it gracefully
  return res.json({ ok: true, region: null });
});

/* ══════════════════════════════════════════════════════════════════
   CORE: Call Gemini with a prompt + PDF base64
   Automatically rotates API key on 429 (quota exceeded).
══════════════════════════════════════════════════════════════════ */
async function callGemini(apiKey, model, base64, promptText) {
  // Use provided key or get current from manager
  const key = apiKey || apiKeyManager.getCurrent();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
  if (!res.ok) {
    const b = await res.text();
    const e = new Error(`HTTP ${res.status}: ${b}`);
    e.status = res.status;
    e.usedKey = key;
    throw e;
  }
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
  const maxKeyRotations = apiKeyManager.count;

  for (const model of models) {
    let keyRotations = 0;
    while (keyRotations <= maxKeyRotations) {
      const currentKey = apiKeyManager.getCurrent();
      try {
        const parsed = await callGemini(currentKey, model, base64, promptText);
        if (validate && !validate(parsed)) { lastError = `${model}: validation failed`; break; }
        console.log(`[Gemini] ✅ ${model} succeeded`);
        return { parsed, model };
      } catch (err) {
        if (err.status === 429) {
          // Quota exceeded — rotate to next key and retry same model
          console.warn(`[Gemini] 429 on key ...${currentKey.slice(-6)} for model ${model}. Rotating key.`);
          apiKeyManager.markQuotaExhausted(currentKey);
          keyRotations++;
          if (keyRotations <= maxKeyRotations) {
            console.log(`[Gemini] Retrying ${model} with next key (rotation ${keyRotations}/${maxKeyRotations})`);
            continue; // retry with new key
          }
          lastError = `${model}: all keys quota-exhausted`;
        } else {
          lastError = `${model}: ${err.message}`;
          if (err.status === 404) cachedModels = null;
        }
        break;
      }
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
- Set "figureRegion": an object {"top": T, "bottom": B} where T and B are the percentage (0-100) of the page height where the figure starts and ends. E.g. if the figure occupies from 35% to 65% of the page, set {"top": 35, "bottom": 65}. Be precise — this is used to crop the image to show only the diagram.
- In the question "text", write [FIGURE] as a placeholder at the position of the diagram
- For MCQ options that are themselves diagrams (e.g. "which graph is correct?"):
  write "[FIGURE_A]", "[FIGURE_B]", "[FIGURE_C]", "[FIGURE_D]" in the options array
- Do NOT describe the diagram in words — just mark the page number and region

Example (figure in question body):
{"id":5,"subject":"${subject}","type":"mcq","text":"A block of mass 2kg is placed as shown. [FIGURE] Find the normal force.","options":["10N","20N","15N","25N"],"correct":1,"marks":4,"negative":-1,"hasFigure":true,"figurePageNumber":4,"figureRegion":{"top":40,"bottom":68}}

Example (options are graphs/diagrams):
{"id":8,"subject":"${subject}","type":"mcq","text":"The velocity-time graph for the given motion is:","options":["[FIGURE_A]","[FIGURE_B]","[FIGURE_C]","[FIGURE_D]"],"correct":2,"marks":4,"negative":-1,"hasFigure":true,"figurePageNumber":6,"figureRegion":{"top":30,"bottom":75}}

Return ONLY valid JSON:
{"questions":[
{"id":${startId},"subject":"${subject}","type":"mcq","text":"question text","options":["A","B","C","D"],"correct":0,"marks":4,"negative":-1,"hasFigure":false,"figurePageNumber":null,"figureRegion":null}
]}

RULES:
- subject: EXACTLY "${subject}"
- type: "mcq" for 4-option questions, "integer" for numeric answer
- options: 4 strings for MCQ (never empty), [] for integer
- correct: 0-based index for MCQ (0=A,1=B,2=C,3=D), actual integer for integer type
- marks: 4, negative: -1 for MCQ, 0 for integer
- hasFigure: true only when question has an actual visual element (not just symbols)
- figurePageNumber: exact PDF page number as integer, or null
- figureRegion: {"top": percentage, "bottom": percentage} where the figure is on the page, or null
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
- figureRegion: {"top": T, "bottom": B} where T and B are percentages (0-100) of the page height bounding the figure. E.g. {"top": 35, "bottom": 65}. Be precise.
- In text: write [FIGURE] where the diagram appears
- Options that are diagrams: write "[FIGURE_A]","[FIGURE_B]","[FIGURE_C]","[FIGURE_D]"
- Do NOT describe figures in words

Return ONLY valid JSON:
{"questions":[
{"id":1,"subject":"Physics","type":"mcq","text":"text [FIGURE]","options":["A","B","C","D"],"correct":0,"marks":4,"negative":-1,"hasFigure":true,"figurePageNumber":3,"figureRegion":{"top":40,"bottom":68}},
{"id":2,"subject":"Chemistry","type":"integer","text":"text","options":[],"correct":5,"marks":4,"negative":0,"hasFigure":false,"figurePageNumber":null,"figureRegion":null}
]}
- subject: "Physics", "Chemistry", or "Mathematics" exactly
- Extract ALL questions. Output ONLY JSON.`;
}

/* ══════════════════════════════════════════════════════════════════
   /api/parse-pdf  — main endpoint
══════════════════════════════════════════════════════════════════ */
app.post("/api/parse-pdf", async (req, res) => {
  const geminiApiKey = apiKeyManager.getCurrent();
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
        null, models, base64, buildAnswerKeyPrompt(),
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
        null, models, base64,
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
      null, models, base64, buildFullPrompt(),
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
