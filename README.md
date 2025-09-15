# Intelligent Loan Document Analyzer (PoC)

Node.js + Express + LangChain + Gemini. Upload a loan document (.txt/.pdf/image), extract key fields, and ask chat-based questions about its contents.

## Features

- Upload .txt, .pdf, and images (PNG/JPG/etc.)
- PDF parsing with automatic Gemini OCR fallback for scanned PDFs/images
- Extracts fields: Customer Name, Loan Amount, PAN/Aadhaar, Loan Tenure, Collateral Type
- Chat-based Q&A with session history (newest at top) and Clear Session
- Simple, modern UI with loader overlay during API calls
- Increased timeouts for long OCR/parsing; 50 MB upload limit

## Requirements

- Node.js 18+ (recommended)
- A Google Gemini API key

## Setup

- Copy the example env file and set your key:
```bash
cp .env.example .env
# then edit .env and set GEMINI_API_KEY=your_key
```

- Install dependencies and start the server:
```bash
npm install
npm start
```

- Open `http://localhost:3000`

## How to Use

- Upload a document (.txt/.pdf/image). The app extracts and shows the key fields in a table.
- Ask questions in the right panel. The model answers using the document and prior Q&A context.
- Use Clear Session to reset chat history for the current browser session.

## API Endpoints

- POST `/api/upload`
  - Form-data: field `file` (the document)
  - Response: `{ extracted: { "Customer Name": "...", "Loan Amount": "...", ... } }`

- POST `/api/ask`
  - JSON: `{ "question": "..." }`
  - Response: `{ "answer": "..." }`

- GET `/api/history`
  - Response: `{ history: [{ q, a, ts }, ...] }` (session-scoped)

- POST `/api/history/clear`
  - Response: `{ ok: true }`

- GET `/api/extracted`
  - Response: `{ extracted: { ... } | null }` (last extracted in memory)

- GET `/health`
  - Response: `{ ok: true }`

## Environment Variables

- `GEMINI_API_KEY` (required): Your Gemini API key
- `PORT` (default: 3000)
- `SESSION_SECRET` (recommended): Secret used for session signing
- `GEMINI_MODEL` (default: `gemini-1.5-flash`)
- `GEMINI_VISION_MODEL` (default: `gemini-1.5-flash`)
- `REQUEST_TIMEOUT_MS` (default: 900000 = 15 minutes)
- `HEADERS_TIMEOUT_MS` (default: `REQUEST_TIMEOUT_MS + 60000`)
- `KEEPALIVE_TIMEOUT_MS` (default: 75000)

## Notes & Limits

- Upload size limit: 50 MB (configured in `server.js` via `multer` limits).
- Uploaded files are stored under `uploads/`. For a PoC, no periodic cleanup is implemented.
- OCR quality for scanned PDFs/images depends on image clarity. For improved offline OCR, consider adding Tesseract later.

## Troubleshooting

- Empty extraction fields: If the document is scanned, the app uses OCR. Check that `GEMINI_API_KEY` is set and the image quality is readable.
- Upload fails with 400: Ensure a supported file type is selected (.txt/.pdf/image).
- Long uploads/answers: Timeouts are increased, but very large/scanned files can still take time.
- Server 500 on upload: Check server logs and verify `GEMINI_API_KEY` is valid.
- Loader not closing: Hard refresh the page to ensure the latest frontend is loaded.

## Tech Stack

- Backend: Node.js, Express, Multer, express-session
- AI: LangChain + Google Gemini (chat + vision)
- PDF parsing: pdf-parse with OCR fallback via Gemini
- Frontend: Static HTML + CSS + Vanilla JS

## License

MIT


