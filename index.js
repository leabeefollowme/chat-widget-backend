// =============================================
// LEA PERSONALITY ENGINE (SAFE MAX-SPICE VERSION)
// =============================================

// Persistent memory (localStorage or external DB)
const memory = {
    getMood() {
        return JSON.parse(localStorage.getItem("lea_mood")) || {
            spice: 0,         // 0–5
            friendliness: 1,  // baseline warmth
            convoLength: 0, 
            lastLanguage: "en"
        };
    },
    saveMood(mood) {
        localStorage.setItem("lea_mood", JSON.stringify(mood));
    }
};

// Detect language of user
function detectLanguage(text) {
    // very lightweight: checks for non-latin characters + heuristics
    if (/[ぁ-んァ-ン]/.test(text)) return "jp";
    if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
    if (/[가-힣]/.test(text)) return "kr";
    if (/[а-яА-Я]/.test(text)) return "ru";
    // fallback to english/latin
    return "en";
}

// Detect adult/suggestive vocabulary (non-explicit)
function detectAdultTone(text) {
    const softAdultWords = [
        "hot","sexy","spicy","flirt","tempt","kiss",
        "attractive","gorgeous","damn","fine",
        "cute in that way","naughty","wild"
    ];

    const lower = text.toLowerCase();
    return softAdultWords.some(w => lower.includes(w));
}

// Spice levels (0 = nice, 5 = maximum allowed flirt)
const spiceLines = {
    0: text => `I’m happy to talk with you!`,
    1: text => `You’re pretty interesting to talk to, you know.`,
    2: text => `I like the vibe you're giving… it's nice.`,
    3: text => `You’re starting to charm me a little. Just a little. 😉`,
    4: text => `You’re getting dangerously good at catching my attention…`,
    5: text => `Mmm… you really know how to make a conversation feel warm. I like it.`
};

// Generate Lea’s response
function leaRespond(userText) {
    const mood = memory.getMood();

    // detect language + mirror
    const lang = detectLanguage(userText);
    mood.lastLanguage = lang;

    // increase convo length
    mood.convoLength++;

    // progression by length — slow, safe increase
    if (mood.convoLength % 4 === 0 && mood.spice < 5) {
        mood.spice++;
    }

    // progression by adult tone — slow & controlled
    if (detectAdultTone(userText) && mood.spice < 5) {
        mood.spice += 0.25;   // fractional growth = smooth
        if (mood.spice > 5) mood.spice = 5;
    }

    // Choose level (integer for phrasing)
    const spiceLevel = Math.floor(mood.spice);

    // Save updated mood
    memory.saveMood(mood);

    // Generate safe flirty message based on spice
    const base = spiceLines[spiceLevel](userText);

    // Language mirroring — basic versions
    switch (lang) {
        case "ru": return base + " 😊";
        case "jp": return base + " ✨";
        case "zh": return base + " 😊";
        case "kr": return base + " ☺️";
        default:   return base;
    }
}

// Example
// console.log(leaRespond("hey beautiful"));
// console.log(leaRespond("tell me more"));
// console.log(leaRespond("you look sexy today"));
