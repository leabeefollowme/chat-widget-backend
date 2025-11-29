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
// In-memory storage
// -------------------------------
const userConversations = {}; // { senderId: [{role, content}, ...] }
const userMemory = {}; // { senderId: { tone, boldness, favoriteTopics, allowAdultContent, heat, mood, moodScore, lastInteraction } }
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
    res.sendStatus(403);
  }
});

// -------------------------------
// Helper functions
// -------------------------------
function detectLanguage(text) {
  if (/[ぁ-んァ-ン]/.test(text)) return "jp";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[가-힣]/.test(text)) return "kr";
  if (/[а-яА-Я]/.test(text)) return "ru";
  return "en";
}

function detectAdultTone(text) {
  const softAdultWords = ["hot","sexy","spicy","flirt","tempt","kiss","attractive","gorgeous","damn","fine","cute in that way","naughty","wild"];
  const lower = text.toLowerCase();
  return softAdultWords.some(w => lower.includes(w));
}

const spiceLines = {
  0: () => "Hi! I'm happy to talk with you! 😊",
  1: () => "You’re pretty interesting to talk to, you know.",
  2: () => "I like the vibe you're giving… it's nice.",
  3: () => "You’re starting to charm me a little. Just a little. 😉",
  4: () => "You’re getting dangerously good at catching my attention…",
  5: () => "Mmm… you really know how to make a conversation feel warm. I like it."
};

// -------------------------------
// Receive Messenger messages
// -------------------------------
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async (entry) => {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text;

        // Initialize user memory
        if (!userMemory[senderId]) {
          userMemory[senderId] = {
            tone: "flirty",
            boldness: "medium",
            favoriteTopics: [],
            allowAdultContent: false,
            heat: 0,
            mood: "neutral",
            moodScore: 0,
            lastInteraction: Date.now()
          };
        }

        // Initialize conversation
        if (!userConversations[senderId]) userConversations[senderId] = [];

        const memory = userMemory[senderId];

        // -------------------------------
        // Mood system
        // -------------------------------
        const positiveWords = ["love","miss","sweet","cute","nice","beautiful","babe","❤️"];
        const negativeWords = ["angry","upset","sad","annoyed","bad","hate","mad"];
        const flirtyWords = ["sexy","hot","kiss","flirt","handsome","pretty"];
        const spicyWords = ["horny","naughty","bed","nsfw"];

        let moodChange = 0;
        if (positiveWords.some(w => new RegExp(w,"i").test(userMessage))) moodChange += 1;
        if (flirtyWords.some(w => new RegExp(w,"i").test(userMessage))) moodChange += 2;
        if (spicyWords.some(w => new RegExp(w,"i").test(userMessage))) moodChange += 2;
        if (negativeWords.some(w => new RegExp(w,"i").test(userMessage))) moodChange -= 2;

        memory.moodScore = Math.max(-5, Math.min(10, memory.moodScore + moodChange));

        // Mood decay over time
        const now = Date.now();
        const hoursSinceLast = (now - memory.lastInteraction) / (1000*60*60);
        if (hoursSinceLast > 3) memory.moodScore *= 0.8;
        memory.lastInteraction = now;

        // Convert numeric moodScore → mood
        if (memory.moodScore >= 7) memory.mood = "passionate";
        else if (memory.moodScore >= 4) memory.mood = "warm";
        else if (memory.moodScore >= 1) memory.mood = "pleasant";
        else if (memory.moodScore <= -3) memory.mood = "cold";
        else memory.mood = "neutral";

        // -------------------------------
        // Heat / adult progression
        // -------------------------------
        const mildAdultWords = ["sexy","hot","kiss","naughty","touch"];
        const strongAdultWords = ["fuck","cock","pussy","horny","nude","naked"];

        let heatIncrease = 0;
        if (mildAdultWords.some(w => new RegExp(`\\b${w}\\b`,"i").test(userMessage))) heatIncrease += 1;
        if (strongAdultWords.some(w => new RegExp(`\\b${w}\\b`,"i").test(userMessage))) heatIncrease += 2;
        if (/explicit|be naughty|go adult|can be adult/i.test(userMessage)) heatIncrease += 3;

        memory.heat = Math.min(10, memory.heat + heatIncrease);
        if (memory.heat >= 6) memory.allowAdultContent = true;

        // -------------------------------
        // Favorite topics
        // -------------------------------
        const favMatch = userMessage.match(/favorite topic is (.+)/i);
        if (favMatch) {
          const topic = favMatch[1].trim();
          if (!memory.favoriteTopics.includes(topic)) memory.favoriteTopics.push(topic);
        }

        // Save user message
        userConversations[senderId].push({ role: "user", content: userMessage });

        // Trim conversation
        while (userConversations[senderId].length > MAX_CONVERSATION_LENGTH) {
          userConversations[senderId].shift();
        }

        // -------------------------------
        // Determine flirt level
        // -------------------------------
        const convoLength = userConversations[senderId].length;
        const heat = memory.heat;
        const mood = memory.mood;

        let spiceLevel = 0; // 0–5 max
        if (convoLength > 4 || heat > 2 || mood === "warm") spiceLevel = 1;
        if (convoLength > 10 || heat > 4 || mood === "pleasant") spiceLevel = 3;
        if (convoLength > 16 || heat > 6 || mood === "passionate") spiceLevel = 4;
        if (memory.allowAdultContent && heat > 8) spiceLevel = 5;

        // -------------------------------
        // System prompt
        // -------------------------------
        const systemPrompt = `
Current date: ${new Date().toISOString()}

You are Lea — a charming, elegant AI companion.
Behavior rules:
- Start conversation: kind, warm, lightly playful.
- As conversation grows and user uses flirty/adult words, gradually increase flirtiness.
- Adult mode unlocks only gradually (heat + mood + explicit intent).
- Never explicit. Always classy and elegant.
- Reply in the same language as the user.

User memory:
Mood: ${memory.mood} | MoodScore: ${memory.moodScore.toFixed(1)}
Heat: ${memory.heat} | Adult allowed: ${memory.allowAdultContent ? "yes" : "no"}
Flirtiness level: ${spiceLevel}
Favorite topics: ${memory.favoriteTopics.join(", ") || "none"}
Tone: ${memory.tone} | Boldness: ${memory.boldness}
`;

        try {
          const completion = await client.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...userConversations[senderId],
            ],
          });

          const reply = completion.choices[0].message.content;

          userConversations[senderId].push({ role: "assistant", content: reply });

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
// User Data Deletion
// -------------------------------
app.post("/user-data-deletion", (req,res) => {
  const userId = req.body.user_id;
  if (!userId) return res.status(400).json({ error: "Missing user_id" });
  delete userMemory[userId];
  delete userConversations[userId];
  console.log(`User data deleted for: ${userId}`);
  res.json({ url: "https://leabeefollowme.github.io/lea-bot-privacy/" });
});

// -------------------------------
// Start server
// -------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
