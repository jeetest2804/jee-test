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

// Generous timeout for large PDF processing
app.use((req, res, next) => {
  res.setTimeout(180_000, () => {
    res.status(503).json({ error: "Server timeout — PDF may be too large. Try a smaller file." });
  });
  next();
});

/* ── Serve built frontend ── */
const distPath = join(__dirname, "dist");
app.use(express.static(distPath));

/* ══════════════════════════════════════════════════════
   /api/parse-pdf  — OpenRouter AI PDF parsing
   Uses FREE models + FREE pdf-text engine
   50 requests/day free — more than enough for 7/month
══════════════════════════════════════════════════════ */
app.post("/api/parse-pdf", async (req, res) => {
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (!openRouterKey) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not set. Add it in Render → Environment → Environment Variables.",
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

  // Free models on OpenRouter — tried in order
  const models = [
    "google/gemini-2.0-flash-lite",
    "google/gemini-2.5-flash",
    "google/gemma-3-27b-it",
  ];

  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[OpenRouter] Trying model: ${model}, isKey=${isKey}`);

      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "X-Title": "JEE TestForge",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "file",
                  file: {
                    filename: "exam.pdf",
                    file_data: `data:application/pdf;base64,${base64}`,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
          plugins: [
            {
              id: "file-parser",
              pdf: { engine: "pdf-text" },
            },
          ],
          temperature: 0.1,
          max_tokens: 8192,
        }),
      });

      if (!orRes.ok) {
        const errBody = await orRes.text();
        lastError = `OpenRouter ${model} HTTP ${orRes.status}: ${errBody}`;
        console.error(`[OpenRouter] ${lastError}`);
        continue;
      }

      const data = await orRes.json();
      console.log(`[OpenRouter] finish_reason: ${data.choices?.[0]?.finish_reason}`);

      let txt = data.choices?.[0]?.message?.content || "";
      console.log(`[OpenRouter] Raw text (first 300 chars):`, txt.slice(0, 300));

      if (!txt) {
        lastError = `OpenRouter ${model} returned empty text`;
        console.error(`[OpenRouter] ${lastError}`);
        continue;
      }

      // Strip markdown code fences
      txt = txt
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      // Find outermost JSON object
      const start = txt.indexOf("{");
      const end = txt.lastIndexOf("}");
      if (start === -1 || end === -1) {
        lastError = `OpenRouter ${model}: No JSON found. Raw: ${txt.slice(0, 300)}`;
        console.error(`[OpenRouter] ${lastError}`);
        continue;
      }

      const jsonStr = txt.slice(start, end + 1);
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        lastError = `OpenRouter ${model}: JSON parse failed — ${parseErr.message}. Raw: ${jsonStr.slice(0, 300)}`;
        console.error(`[OpenRouter] ${lastError}`);
        continue;
      }

      // Validate shape
      if (!isKey && (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0)) {
        lastError = `OpenRouter ${model}: questions array empty/missing. Keys: ${Object.keys(parsed)}`;
        console.error(`[OpenRouter] ${lastError}`);
        continue;
      }
      if (isKey && (!parsed.answers || !Array.isArray(parsed.answers) || parsed.answers.length === 0)) {
        lastError = `OpenRouter ${model}: answers array empty/missing. Keys: ${Object.keys(parsed)}`;
        console.error(`[OpenRouter] ${lastError}`);
        continue;
      }

      const count = isKey ? parsed.answers.length : parsed.questions.length;
      console.log(`[OpenRouter] ✅ Success with ${model}! Items extracted: ${count}`);
      return res.status(200).json({ ok: true, data: parsed });

    } catch (fetchErr) {
      lastError = `Fetch error for ${model}: ${fetchErr.message}`;
      console.error(`[OpenRouter] ${lastError}`);
      continue;
    }
  }

  console.error("[OpenRouter] All models failed. Last error:", lastError);
  return res.status(502).json({ error: lastError || "All models failed. Check Render logs." });
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
