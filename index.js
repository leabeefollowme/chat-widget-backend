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

// In-memory storage for user conversations and memory
const userConversations = {}; // { senderId: [ {role, content}, ... ] }
const userMemory = {}; // { senderId: { tone, boldness, favoriteTopics } }

// Maximum messages to keep in conversation history to prevent token overflow
const MAX_CONVERSATION_LENGTH = 20;

// -------------------------------
// Health route
// -------------------------------
app.get("/", (req, res) => res.send("Backend is running"));

// -------------------------------
// Messenger webhook verification
// -------------------------------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFIED ✔");
    res.status(200).send(challenge);
  } else {
    console.log("WEBHOOK VERIFICATION FAILED ❌", {
      receivedMode: mode,
      receivedToken: token,
    });
    res.sendStatus(403);
  }
});

// -------------------------------
// Receive messages
// -------------------------------
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async (entry) => {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text;

        // Initialize conversation and memory if first message
        if (!userConversations[senderId]) userConversations[senderId] = [];
        if (!userMemory[senderId])
          userMemory[senderId] = {
            tone: "friendly",
            boldness: "medium",
            favoriteTopics: [],
          };

        // Add user message to history
        userConversations[senderId].push({ role: "user", content: userMessage });

        // Trim old messages if exceeding MAX_CONVERSATION_LENGTH
        while (userConversations[senderId].length > MAX_CONVERSATION_LENGTH) {
          userConversations[senderId].shift();
        }

        try {
          // Prepare memory text
          const memoryText = `
Tone: ${userMemory[senderId].tone}
Boldness: ${userMemory[senderId].boldness}
Favorite topics: ${userMemory[senderId].favoriteTopics.join(", ") || "none"}
          `;

          // Call OpenAI with conversation + memory
          const completion = await client.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "system",
                content: `
Current date: ${new Date().toISOString()}

You are Lea — a sophisticated AI companion.
Follow the user's preferences for tone, boldness, and favorite topics.
Always reply in the same language the user uses.
User preferences:
${memoryText}
                `,
              },
              ...userConversations[senderId],
            ],
          });

          const reply = completion.choices[0].message.content;

          // Add AI reply to history
          userConversations[senderId].push({ role: "assistant", content: reply });

          // Send reply to Messenger
          await axios.post(
            `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: reply },
            }
          );
        } catch (err) {
          console.error("OpenAI / Messenger error:", err.response?.data || err);
        }
      }
    });

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// -------------------------------
// Optional: Frontend AI-chat route
// -------------------------------
app.post("/ai-chat", async (req, res) => {
  try {
    const { message, memory = {}, history = [] } = req.body;

    const memoryText = `
Tone: ${memory.tone || "friendly"}
Boldness: ${memory.boldness || "medium"}
Favorite topics: ${memory.favoriteTopics?.join(", ") || "none"}
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

You are Lea — a sophisticated AI companion.
Follow the user's preferences for tone, boldness, and interests.
Always reply in the same language the user used in their last message.
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
// Start server
// -------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
