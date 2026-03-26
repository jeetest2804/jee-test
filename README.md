# JEE TestForge — with API Key Rotation

## What Changed (v3)

**New: API Key Rotation** — If one Gemini API key hits its quota limit (429), the server automatically switches to the next available key. Zero downtime, no manual intervention.

**Also included from v2:** Diagrams show the **actual PDF page image** — no re-drawn figures, 100% accurate.

---

## API Key Rotation

### How it works
1. You set multiple Gemini API keys as environment variables
2. The server uses the first available (non-exhausted) key for every request
3. If a key returns HTTP 429 (quota exceeded), it's marked as cooling down for 60 seconds
4. The next key in the pool is used immediately — same request, different key
5. After the cooldown, the key re-enters rotation automatically

### Setting up multiple keys
**Option A — Numbered keys (recommended):**
```
GEMINI_API_KEY=AIza...key1
GEMINI_API_KEY_2=AIza...key2
GEMINI_API_KEY_3=AIza...key3
GEMINI_API_KEY_4=AIza...key4
GEMINI_API_KEY_5=AIza...key5
```

**Option B — Comma-separated pool:**
```
GEMINI_API_KEY_POOL=AIza...key1,AIza...key2,AIza...key3
```

Both formats can be combined — duplicates are removed automatically.

### Monitor key status
```
GET /api/key-status
```
Returns which keys are active vs. cooling down.

---

## Deploy to Render.com

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo
3. Render will auto-detect `render.yaml` and configure everything
4. In Render dashboard → Environment → add your keys:
   - `GEMINI_API_KEY = AIza...key1`
   - `GEMINI_API_KEY_2 = AIza...key2`
   - *(add as many as you have)*
5. Deploy!

---

## Local Development

```bash
npm install
GEMINI_API_KEY=key1 GEMINI_API_KEY_2=key2 node server.js
```

Requires `poppler-utils` locally:
- Ubuntu/Debian: `sudo apt-get install poppler-utils`
- Mac: `brew install poppler`

---

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Primary Gemini API key (required) |
| `GEMINI_API_KEY_2` | Second key for rotation (optional) |
| `GEMINI_API_KEY_3` | Third key (optional) |
| `GEMINI_API_KEY_4` | Fourth key (optional) |
| `GEMINI_API_KEY_5` | Fifth key (optional) |
| `GEMINI_API_KEY_POOL` | Comma-separated key pool (optional, alternative format) |
| `PORT` | Server port (default 3000) |


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
