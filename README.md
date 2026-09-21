# Coach Joanne AI Marketer — local rebuild

React (Vite) front end + Node.js (Express) API, seeded from `LIVE_DUMP.md`. Token architecture matches production: **full compiled modules + full history** each turn. TOKEN_USAGE mitigations are **not** applied.

## Run

```bash
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

Open http://localhost:5173

- Login with a **whitelist email** (OTP is shown on the login card in dev).
- Admin: `adriantzx2511@gmail.com` → Gmail Access, AI Prompt, Prompt Testing, Report Analysis.
- Students land on chat.

Optional live models (local testing):

1. Create a key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)
2. Put it in `backend/.env` as `CURSOR_API_KEY=cursor_...` (`LLM_BACKEND=cursor`)
3. Restart the API

Prompt Testing then generates Kael via the Cursor Agent SDK (`tools: []`, isolated workspace). This is not the production Anthropic path.

Alternatively set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` with `LLM_BACKEND=direct`.

Re-seed: delete `backend/data/app.json` after changing `backend/data/seed.json`.

