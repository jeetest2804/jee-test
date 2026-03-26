# JEE TestForge — Improved with Real Diagram Images

## What Changed (v2)

**Problem fixed:** Diagrams were being re-drawn from text descriptions, causing wrong/random figures.

**Solution:** When a question has a figure, the server now renders the **actual PDF page** as a PNG image and shows it directly — no re-drawing, 100% accurate.

### How it works
1. Gemini reads the PDF and notes the **page number** for each question with a figure
2. A new `/api/page-image` endpoint renders that exact PDF page using `pdftoppm`
3. The frontend shows the real image from the PDF — circuits, graphs, geometry — exactly as printed

---

## Deploy to Render.com

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo
3. Render will auto-detect `render.yaml` and configure everything
4. In Render dashboard → Environment → add: `GEMINI_API_KEY = your_key_here`
5. Deploy!

> `poppler-utils` is installed automatically by the build command in `render.yaml`.

---

## Local Development

```bash
npm install
GEMINI_API_KEY=your_key npm run dev   # frontend on :5173
node server.js                         # backend on :3000
```

Requires `poppler-utils` locally:
- Ubuntu/Debian: `sudo apt-get install poppler-utils`
- Mac: `brew install poppler`

---

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key (required) |
| `PORT` | Server port (default 3000) |
