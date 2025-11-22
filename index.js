import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// POST /ai-chat
app.post("/ai-chat", async (req, res) => {
  try {
    const { message, memory } = req.body;

    // Build prompt from memory
    const memoryText = `
Tone: ${memory?.tone || "seductive"}
Boldness: ${memory?.boldness || "medium"}
Favorite topics: ${memory?.favoriteTopics?.join(", ") || "none"}
    `;

    const prompt = `
You are "The Model" — seductive, sophisticated, elegant.
Here are the user's saved preferences:
${memoryText}

User says: "${message}"
Reply in character.
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are a seductive, elegant AI companion." },
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
