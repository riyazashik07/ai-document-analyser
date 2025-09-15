import dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenerativeAI } from "@google/generative-ai";

const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
let chatModel;
let genai;
let cachedPdfParse;

function getModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment");
  }
  if (!chatModel) {
    chatModel = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: modelName,
      temperature: 0.2,
    });
  }
  return chatModel;
}

function getGenAi() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment");
  }
  if (!genai) {
    genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genai;
}

async function loadPdfParse() {
  if (cachedPdfParse) return cachedPdfParse;
  // Prefer CommonJS require to avoid ESM interop issues
  const require = createRequire(import.meta.url);
  try {
    cachedPdfParse = require("pdf-parse");
    return cachedPdfParse;
  } catch (err) {
    // Fallback to dynamic import if require fails
    const mod = await import("pdf-parse");
    cachedPdfParse = mod?.default || mod;
    return cachedPdfParse;
  }
}

function pickTextFromAiMessage(aiMessage) {
  if (!aiMessage) return "";
  // LangChain chat models typically return an AIMessage with .content as string
  const content = aiMessage.content ?? aiMessage.text ?? "";
  if (Array.isArray(content)) {
    // In some cases content can be an array of parts
    return content.map((c) => (typeof c === "string" ? c : c?.text ?? "")).join("\n");
  }
  return typeof content === "string" ? content : String(content ?? "");
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {}
  }
  return { raw: String(text).trim() };
}

export async function extractFields(documentText) {
  const model = getModel();
  const prompt = `Extract the following fields from this loan document. Respond ONLY with a valid JSON object with these exact keys: "Customer Name", "Loan Amount", "PAN/Aadhaar", "Loan Tenure", "Collateral Type". If a field is missing, set it to an empty string.

Document:\n${documentText}`;

  const ai = await model.invoke(prompt);
  const text = pickTextFromAiMessage(ai);
  return safeParseJson(text);
}

function formatHistoryForPrompt(historyItems) {
  if (!Array.isArray(historyItems) || historyItems.length === 0) return "";
  const lines = historyItems
    .slice(-12)
    .map((it, idx) => `Turn ${idx + 1}:\nQ: ${it.q || ""}\nA: ${it.a || ""}`)
    .join("\n\n");
  return `Previous Q&A (most recent last):\n${lines}\n\n`;
}

export async function answerQuestion(documentText, question, history = []) {
  const model = getModel();
  const historyBlock = formatHistoryForPrompt(history);
  const prompt = `You are a helpful loan document assistant. Use the document and the prior Q&A context to answer.

Document:\n${documentText}

${historyBlock}Question:\n${question}`;

  const ai = await model.invoke(prompt);
  return pickTextFromAiMessage(ai).trim();
}

export async function extractTextFromFile(filePath, mimeType) {
  const lower = (mimeType || "").toLowerCase();
  if (lower.includes("pdf")) {
    const buffer = await fs.readFile(filePath);
    try {
      const pdfParse = await loadPdfParse();
      const data = await pdfParse(buffer);
      const parsedText = (data?.text || "").trim();
      if (parsedText && parsedText.length > 50) {
        return parsedText;
      }
    } catch (err) {
      // Continue to OCR fallback
    }
    // Fallback: use Gemini to extract text from PDF (handles scanned PDFs)
    const api = getGenAi();
    const model = api.getGenerativeModel({ model: process.env.GEMINI_VISION_MODEL || "gemini-1.5-flash" });
    const b64 = buffer.toString("base64");
    const result = await model.generateContent([
      { text: "Extract all legible text from every page of this PDF as plain text. Keep reading order if possible." },
      { inlineData: { mimeType: "application/pdf", data: b64 } }
    ]);
    const text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return String(text).trim();
  }

  if (lower.startsWith("image/")) {
    // Use Gemini vision model for OCR-like extraction
    const api = getGenAi();
    const model = api.getGenerativeModel({ model: process.env.GEMINI_VISION_MODEL || "gemini-1.5-flash" });
    const bytes = await fs.readFile(filePath);
    const b64 = bytes.toString("base64");
    const result = await model.generateContent([
      { text: "Extract all visible text content from this image as plain text." },
      { inlineData: { mimeType: mimeType, data: b64 } }
    ]);
    const text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return String(text).trim();
  }

  // Fallback: treat as utf8 text
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text;
  } catch {
    return "";
  }
}


