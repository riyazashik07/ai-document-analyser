import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs/promises";
import session from "express-session";
import { extractFields, answerQuestion, extractTextFromFile } from "./geminiService.js";

dotenv.config();

const app = express();
const uploadsDir = path.join(process.cwd(), "uploads");
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB upload limit
    fieldSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "text/plain" ||
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/");
    if (!ok) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

app.use(express.json({ limit: "4mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 30 },
  })
);
app.use(express.static(path.join(process.cwd(), "public")));

let lastDocumentText = "";
let lastExtracted = null;

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const filePath = req.file.path;
    const text = await extractTextFromFile(filePath, req.file.mimetype);
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Uploaded file is empty or unreadable" });
    }

    lastDocumentText = text;
    const extracted = await extractFields(text);
    lastExtracted = extracted;

    // Reset session convo on new upload
    req.session.history = [];

    return res.json({ extracted });
  } catch (error) {
    console.error("/api/upload error", error);
    return res.status(500).json({ error: "Failed to process upload" });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const question = (req.body && req.body.question) || "";
    if (!question.trim()) {
      return res.status(400).json({ error: "Missing question" });
    }
    if (!lastDocumentText) {
      return res.status(400).json({ error: "No document uploaded yet" });
    }

    const history = req.session.history || [];
    const answer = await answerQuestion(lastDocumentText, question, history);

    // Persist Q&A in session
    if (!req.session.history) req.session.history = [];
    req.session.history.push({ q: question, a: answer, ts: Date.now() });

    return res.json({ answer });
  } catch (error) {
    console.error("/api/ask error", error);
    return res.status(500).json({ error: "Failed to answer question" });
  }
});

app.get("/api/history", (req, res) => {
  res.json({ history: req.session.history || [] });
});

app.post("/api/history/clear", (req, res) => {
  req.session.history = [];
  res.json({ ok: true });
});

app.get("/api/extracted", (_req, res) => {
  res.json({ extracted: lastExtracted || null });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

// Increase server timeouts to allow long OCR/parse operations
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15 * 60 * 1000); // 15 minutes
const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS || REQUEST_TIMEOUT_MS + 60 * 1000);
const KEEPALIVE_TIMEOUT_MS = Number(process.env.KEEPALIVE_TIMEOUT_MS || 75 * 1000);

server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = KEEPALIVE_TIMEOUT_MS;
if (typeof server.setTimeout === "function") {
  server.setTimeout(REQUEST_TIMEOUT_MS);
}


