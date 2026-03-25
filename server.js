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
{"answers":[{"q":1,"correct":"B","type":"mcq"},{"q":2,"correct":24,"type":"integer"},...]}
Rules:
- For MCQ questions: correct is the letter "A", "B", "C" or "D"
- For integer questions: correct is the number itself
- Include every question that has an answer`
    : `Extract ALL questions from this JEE exam PDF. Return ONLY valid JSON — no markdown, no extra text:
{"questions":[{"id":1,"subject":"Physics","type":"mcq","text":"full question text","options":["A) option1","B) option2","C) option3","D) option4"],"marks":4,"negative":-1}]}
Rules:
- subject must be exactly "Physics", "Chemistry" or "Mathematics"
- type is "mcq" (4 options) or "integer" (no options, options=[])
- Include ALL questions found in the PDF
- Do not skip any question`;

  try {
    // Try gemini-1.5-flash first, fallback to gemini-1.5-pro
    const models = ["gemini-1.5-flash", "gemini-1.5-pro"];
    let lastError = null;

    for (const model of models) {
      try {
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
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (!geminiRes.ok) {
          const errBody = await geminiRes.text();
          lastError = `Gemini ${model} error ${geminiRes.status}: ${errBody}`;
          console.error(lastError);
          continue; // try next model
        }

        const data = await geminiRes.json();
        let txt =
          data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Strip markdown fences if any
        txt = txt.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

        // Try to extract JSON if wrapped in extra text
        const jsonMatch = txt.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          lastError = "Gemini returned no JSON object. Raw: " + txt.slice(0, 200);
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          lastError = "JSON parse failed: " + parseErr.message + " Raw: " + txt.slice(0, 200);
          continue;
        }

        return res.status(200).json({ ok: true, data: parsed });
      } catch (fetchErr) {
        lastError = `Fetch error for ${model}: ${fetchErr.message}`;
        continue;
      }
    }

    // All models failed
    return res.status(502).json({ error: lastError || "All Gemini models failed" });
  } catch (err) {
    console.error("Server error:", err);
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
