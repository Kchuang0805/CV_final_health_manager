# Medicare LINE Bot (Python)

FastAPI webhook that connects LINE Messaging API to the MediCare Connect app.

## Environment variables (.env.local)
- `LINE_CHANNEL_SECRET`: Channel secret from LINE Console
- `LINE_CHANNEL_ACCESS_TOKEN`: Channel access token (Messaging API)
- `CORS_ALLOW_ORIGINS` (optional): Comma-separated allowed origins for web calls (default `*`).

Place these in a `.env.local` file (see project root `.env.local.example`). The backend will auto-load `.env.local` from either the project root or `linebot-backend/`.

## Run locally
1) Activate your virtualenv
2) Install deps: `pip install -r requirements.txt`
3) Start dev server: `uvicorn main:app --reload --port 8000`
4) Expose to the internet (e.g. `ngrok http 8000`) and set webhook URL to `https://<public-host>/webhook`

## Health check
- GET `/health` → `{"status": "ok"}`

## Notify endpoint (for web app)
- POST `/notify` with JSON `{ "userId": "<LINE_USER_ID>", "message": "text to push" }`
- Requires the Messaging API token (`LINE_CHANNEL_ACCESS_TOKEN`).

## What it does now
- Verifies LINE signature on `/webhook`
- Replies to basic intents: greetings, help, medication-related, caregiver/doctor, and a fallback
- Supports server-initiated push via `/notify` (for doctor → patient reminders)

## Next steps to customize
- Replace reply texts with deep links to your app (patient/doctor views)
- Add medication state lookups and AI answers by calling your existing Gemini services
- Add logging/persistence (e.g. Cosmos DB, Supabase, or Firestore)
