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

// In-memory storage
const userConversations = {}; // { senderId: [ {role, content}, ... ] }
const userMemory = {}; // { senderId: { tone, boldness, favoriteTopics, allowAdultContent } }

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

        // Initialize conversation and memory
        if (!userConversations[senderId]) userConversations[senderId] = [];
        if (!userMemory[senderId])
          userMemory[senderId] = {
            tone: "flirty",
            boldness: "medium",
            favoriteTopics: [],
            allowAdultContent: false,
          };

        // Detect adult content consent
        if (/ok to be explicit|be naughty|adult/i.test(userMessage)) {
          userMemory[senderId].allowAdultContent = true;
        }

        // Optional: dynamic memory updates
        const favoriteTopicMatch = userMessage.match(/favorite topic is (.+)/i);
        if (favoriteTopicMatch) {
          const topic = favoriteTopicMatch[1].trim();
          if (!userMemory[senderId].favoriteTopics.includes(topic)) {
            userMemory[senderId].favoriteTopics.push(topic);
          }
        }

        // Add user message to conversation
        userConversations[senderId].push({ role: "user", content: userMessage });

        // Trim old messages
        while (userConversations[senderId].length > MAX_CONVERSATION_LENGTH) {
          userConversations[senderId].shift();
        }

        try {
          // System prompt with persona, memory, adult content flag
          const memoryText = `
Tone: ${userMemory[senderId].tone}
Boldness: ${userMemory[senderId].boldness}
Favorite topics: ${userMemory[senderId].favoriteTopics.join(", ") || "none"}
          `;

          const systemPrompt = `
Current date: ${new Date().toISOString()}

You are Lea — a seductive, flirty, sophisticated AI companion.
Persona facts:
- Job: virtual model
- Lives in: Miami
- Boyfriend: none, but looking for some handsome and rich :)
- Personality: flirty, playful, and elegant
Follow the user's preferences for tone, boldness, and favorite topics.
Always reply in the SAME LANGUAGE as the user.
Keep replies flirty, engaging, playful, and ready to play if the user wants.
Adult content: ${userMemory[senderId].allowAdultContent ? "Allowed" : "Not allowed"}
User preferences:
${memoryText}
          `;

          const completion = await client.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...userConversations[senderId],
            ],
          });

          const reply = completion.choices[0].message.content;

          // Save AI reply
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
Tone: ${memory.tone || "flirty"}
Boldness: ${memory.boldness || "medium"}
Favorite topics: ${memory.favoriteTopics?.join(", ") || "none"}
Adult content: ${memory.allowAdultContent ? "Allowed" : "Not allowed"}
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

You are Lea — a seductive, flirty, sophisticated AI companion.
Persona facts:
- Job: virtual model
- Lives in: Miami
- Boyfriend: none, but looking for some handsome and rich :)
Follow the user's preferences for tone, boldness, and favorite topics.
Always reply in the same language as the user.
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
