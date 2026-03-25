// api/parse-pdf.js  — Vercel Serverless Function
// The Gemini API key lives ONLY here, in the server environment.
// The browser never sees it.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not set on the server. Add it in Vercel → Project Settings → Environment Variables.",
    });
  }

  const { base64, isKey } = req.body;
  if (!base64) {
    return res.status(400).json({ error: "Missing base64 PDF data" });
  }

  const prompt = isKey
    ? `Extract answer key from this JEE PDF. Return ONLY JSON: {"answers":[{"q":1,"correct":"B","type":"mcq"},...]}  For integer type put the number. No markdown.`
    : `Extract all questions from this JEE exam PDF. Return ONLY JSON:
{"questions":[{"id":1,"subject":"Physics","type":"mcq","text":"...","options":["A)...","B)...","C)...","D)..."],"marks":4,"negative":-1}]}
For integer type, options=[]. No markdown, no preamble.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "application/pdf", data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      return res.status(502).json({
        error: `Gemini API error ${geminiRes.status}: ${errBody}`,
      });
    }

    const data = await geminiRes.json();
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = txt.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({
        error: "Gemini returned invalid JSON. Raw response: " + txt.slice(0, 300),
      });
    }

    return res.status(200).json({ ok: true, data: parsed });
  } catch (err) {
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}

