# TestForge — JEE Exam Platform

## Deploy on Render (Step-by-Step)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/jee-test-app.git
git push -u origin main
```

### 2. Create Web Service on Render
1. Go to https://render.com → **New** → **Web Service**
2. Connect your GitHub repo
3. Use these settings:
   - **Environment:** Node
   - **Build Command:** `npm run render-build`
   - **Start Command:** `npm start`

### 3. Set Environment Variable
In Render → Your Service → **Environment** tab:
- Key: `GEMINI_API_KEY`
- Value: your Gemini API key from https://aistudio.google.com/app/apikey

### 4. Deploy
Click **Deploy** — Render will build and start your app automatically.

---

## Local Development

```bash
# Terminal 1 — Start Express server
node server.js

# Terminal 2 — Start Vite dev server
npm run dev
```

Create a `.env` file in the root:
```
GEMINI_API_KEY=your_key_here
```

Then visit http://localhost:5173
