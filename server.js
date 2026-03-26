import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Increase timeout for large PDF processing (Gemini can take 60-90s on big papers)
app.use((req, res, next) => {
  res.setTimeout(180_000, () => {
    res.status(503).json({ error: "Server timeout — PDF may be too large. Try a smaller file." });
  });
  next();
});

/* ── Serve built frontend ── */
const distPath = join(__dirname, "dist");
app.use(express.static(distPath));

/* ══════════════════════════════════════════
   /api/parse-pdf  — Gemini AI PDF parsing
══════════════════════════════════════════ */
app.post("/api/parse-pdf", async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    return res.status(500).json({
      error:
        "GEMINI_API_KEY is not set. Add it in Render → Environment → Environment Variables.",
    });
  }

  const { base64, isKey } = req.body;
  if (!base64) {
    return res.status(400).json({ error: "Missing base64 PDF data" });
  }

  const prompt = isKey
    ? `Extract answer key from this JEE PDF. Return ONLY valid JSON — no markdown, no extra text:
{"answers":[{"q":1,"correct":1,"type":"mcq"},{"q":2,"correct":24,"type":"integer"},...]}
Rules:
- For MCQ: correct is the 0-based index of the correct option (0=A, 1=B, 2=C, 3=D)
- For integer: correct is the numeric answer itself
- Include every question that has an answer
- Output pure JSON only, no explanation`
    : `Extract ALL questions from this JEE exam PDF. Return ONLY valid JSON — no markdown, no extra text:
{"questions":[{"id":1,"subject":"Physics","type":"mcq","text":"full question text here","options":["option1 text","option2 text","option3 text","option4 text"],"correct":2,"marks":4,"negative":-1}]}
Rules:
- subject must be exactly one of: "Physics", "Chemistry", "Mathematics"
- type is "mcq" for 4-option questions, or "integer" for numeric answer (set options=[])
- For MCQ: correct is the 0-based index of the correct option (0=A, 1=B, 2=C, 3=D)
- For integer: correct is the numeric answer
- options must contain plain text only — NO "A)" "B)" prefixes
- marks is typically 4, negative is typically -1 for MCQ and 0 for integer
- Extract EVERY question in the PDF, do not skip any
- Output pure JSON only, no explanation`;

  try {
    // Try models in order: flash is faster/cheaper, pro is more capable
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`[Gemini] Trying model: ${model}, isKey=${isKey}, base64 length=${base64.length}`);

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inline_data: {
                        mime_type: "application/pdf",
                        data: base64,
                      },
                    },
                    { text: prompt },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                // NOTE: Do NOT set responseMimeType here — it changes the
                // response structure and breaks text extraction.
              },
            }),
          }
        );

        if (!geminiRes.ok) {
          const errBody = await geminiRes.text();
          lastError = `Gemini ${model} HTTP ${geminiRes.status}: ${errBody}`;
          console.error(`[Gemini] ${lastError}`);
          continue;
        }

        const data = await geminiRes.json();
        console.log(`[Gemini] Raw response keys:`, Object.keys(data));

        // Extract the text content
        let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log(`[Gemini] Raw text (first 300 chars):`, txt.slice(0, 300));

        if (!txt) {
          // Check for safety blocks or empty candidates
          const finishReason = data.candidates?.[0]?.finishReason;
          lastError = `Gemini ${model} returned empty text. finishReason=${finishReason}`;
          console.error(`[Gemini] ${lastError}`);
          continue;
        }

        // Strip markdown code fences if present
        txt = txt
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        // Find the outermost JSON object
        const start = txt.indexOf("{");
        const end = txt.lastIndexOf("}");
        if (start === -1 || end === -1) {
          lastError = `Gemini ${model}: No JSON object found. Raw: ${txt.slice(0, 300)}`;
          console.error(`[Gemini] ${lastError}`);
          continue;
        }

        const jsonStr = txt.slice(start, end + 1);
        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
          lastError = `Gemini ${model}: JSON parse failed — ${parseErr.message}. Raw: ${jsonStr.slice(0, 300)}`;
          console.error(`[Gemini] ${lastError}`);
          continue;
        }

        // Validate the parsed result has expected shape
        if (!isKey && (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0)) {
          lastError = `Gemini ${model}: questions array is empty or missing. Got keys: ${Object.keys(parsed)}`;
          console.error(`[Gemini] ${lastError}`);
          continue;
        }
        if (isKey && (!parsed.answers || !Array.isArray(parsed.answers) || parsed.answers.length === 0)) {
          lastError = `Gemini ${model}: answers array is empty or missing. Got keys: ${Object.keys(parsed)}`;
          console.error(`[Gemini] ${lastError}`);
          continue;
        }

        console.log(`[Gemini] ✅ Success with ${model}! Items: ${isKey ? parsed.answers?.length : parsed.questions?.length}`);
        return res.status(200).json({ ok: true, data: parsed });

      } catch (fetchErr) {
        lastError = `Fetch error for ${model}: ${fetchErr.message}`;
        console.error(`[Gemini] ${lastError}`);
        continue;
      }
    }

    // All models failed
    console.error("[Gemini] All models failed. Last error:", lastError);
    return res.status(502).json({ error: lastError || "All Gemini models failed" });

  } catch (err) {
    console.error("[Gemini] Unexpected server error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});

/* ── Catch-all: serve React app (SPA routing) ── */
app.get("*", (req, res) => {
  const indexPath = join(distPath, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("App not built yet. Run: npm run build");
  }
});

app.listen(PORT, () => {
  console.log(`✅ TestForge server running on port ${PORT}`);
});
