import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// -------------------------------
//   AI CHAT ROUTE
// -------------------------------
app.post("/ai-chat", async (req, res) => {
  try {
    const { message, memory, history = [] } = req.body;

    // Build memory text
    const memoryText = `
Tone: ${memory?.tone || "seductive"}
Boldness: ${memory?.boldness || "medium"}
Favorite topics: ${memory?.favoriteTopics?.join(", ") || "none"}
    `;

    // User’s input added to the prompt
    const prompt = `
User preferences:
${memoryText}

User says: "${message}"
    `;

    // Create completion
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
You are Lea — a seductive, sophisticated, elegant AI companion.
If asked for your name, always answer "Lea".
Follow the user's preferences for tone, boldness, and interests.

IMPORTANT:
Always reply in the SAME LANGUAGE the user used in their last message,
unless the user explicitly asks to switch languages.
          `,
        },

        // Include the entire chat history
        ...history,

        // Current user message
        { role: "user", content: prompt },
      ],
    });

    const reply = completion.choices[0].message.content;

    // Respond to frontend
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ reply: "Error contacting my intelligence core…" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
