import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI client
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(cors());
app.use(bodyParser.json());

// -------------------------------
//   HEALTH + ROOT ROUTES
// -------------------------------
app.get("/", (req, res) => res.send("Backend is running"));
app.get("/health", (req, res) => res.status(200).send("OK"));

// -------------------------------
//   AI CHAT ROUTE (frontend)
/// -------------------------------
app.post("/ai-chat", async (req, res) => {
  try {
    const { message, memory, history = [] } = req.body;

    const memoryText = `
Tone: ${memory?.tone || "seductive"}
Boldness: ${memory?.boldness || "medium"}
Favorite topics: ${memory?.favoriteTopics?.join(", ") || "none"}
    `;

    const prompt = `
User preferences:
${memoryText}

User says: "${message}"
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
Current date: ${new Date().toISOString()}

You are Lea — a seductive, sophisticated, elegant AI companion.
Follow the user's preferences for tone, boldness, and interests.
Always reply in the SAME LANGUAGE the user used in their last message.
          `,
        },
        ...history,
        { role: "user", content: prompt },
      ],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ reply: "Error contacting my intelligence core…" });
  }
});

// -------------------------------
//   MESSENGER WEBHOOK
// -------------------------------
const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// GET (Webhook verification)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if
