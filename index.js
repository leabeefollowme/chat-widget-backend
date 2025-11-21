import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// POST /ai-chat
app.post("/ai-chat", (req, res) => {
  try {
    const { message, memory } = req.body;

    // Placeholder AI response
    const aiReply = `You said: "${message}" — I remember your preferences: ${JSON.stringify(memory)}`;

    res.json({ reply: aiReply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Error generating AI response." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
