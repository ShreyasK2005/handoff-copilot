# Handoff Copilot (Demo)

This is a lightweight full-stack demo for nurse shift handoffs:
- Frontend: React + Vite
- Backend: Express
- AI: Optional real OpenAI model (falls back to mock output if no API key)

## Run locally

### 1) Server
```bash
cd server
npm install
cp .env.example .env
# edit .env and paste your OPENAI_API_KEY
npm run dev
```
Server runs on http://localhost:5179

### 2) Client
```bash
cd client
npm install
npm run dev
```
Client runs on http://localhost:5173

## Notes
- The backend calls the OpenAI Responses API with Structured Outputs (json_schema) to guarantee valid JSON.
- If the LLM call fails for any reason, the server returns mock output so your demo still works.
