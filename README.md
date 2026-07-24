# Handoff Copilot 

This is a full-stack application for nurse shift handoffs:
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
- If the LLM call fails for any reason, the server returns mock output so it still works.


System Design:

<img width="890" height="500" alt="Screenshot 2026-07-23 at 9 09 23 PM" src="https://github.com/user-attachments/assets/08e4405f-ec4b-4734-949f-a41b764f8780" />

