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
//   HEALTH ROUTES
// -------------------------------
app.get("/", (req, res) => res.send("Backend is running"));
app.get("/health", (req, res) => res.status(200).send("OK"));

// -------------------------------
//   FRONTEND AI CHAT ROUTE
// -------------------------------
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
Follow the user's preferences for tone, boldness
