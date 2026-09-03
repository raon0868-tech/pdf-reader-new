require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


// =========================
// Google Cloud TTS
// =========================

const voices = {
  "en-US": "en-US-Chirp3-HD-Kore",
  "da-DK": "da-DK-Chirp3-HD-Kore",
  "ko-KR": "ko-KR-Chirp3-HD-Kore",
  "ja-JP": "ja-JP-Chirp3-HD-Kore",
  "fr-FR": "fr-FR-Chirp3-HD-Kore",
};

app.get("/", (req, res) => {
  res.send("TTS server is working!");
});


app.post("/api/tts", async (req, res) => {
  try {
    const { text, language } = req.body;

    if (!text) {
      return res.status(400).json({
        error: "Text is required",
      });
    }

    const voiceName = voices[language];

    if (!voiceName) {
      return res.status(400).json({
        error: "Unsupported language",
      });
    }

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            text: text,
          },
          voice: {
            languageCode: language,
            name: voiceName,
          },
          audioConfig: {
            audioEncoding: "MP3",
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("TTS error:", data);

      return res.status(response.status).json(data);
    }

    res.json({
      audioContent: data.audioContent,
    });

  } catch (error) {
    console.error("TTS error:", error);

    res.status(500).json({
      error: "TTS request failed",
    });
  }
});


// =========================
// Google Cloud Translation
// =========================

const languageCodes = {
  "en-US": "en",
  "da-DK": "da",
  "ko-KR": "ko",
  "ja-JP": "ja",
  "fr-FR": "fr",
};


// 번역할 언어
const targetLanguages = {
  "en-US": ["ko", "da"],
  "da-DK": ["ko", "en"],
  "ko-KR": ["en", "da"],
  "ja-JP": ["ko", "en"],
  "fr-FR": ["ko", "en"],
};


const languageNames = {
  en: "English",
  da: "Dansk",
  ko: "한국어",
  ja: "日本語",
  fr: "Français",
};


app.post("/api/translate", async (req, res) => {
  try {
    const { text, language } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        error: "Text is required",
      });
    }

    const sourceLanguage =
      languageCodes[language];

    const targets =
      targetLanguages[language];

    if (!sourceLanguage || !targets) {
      return res.status(400).json({
        error: "Unsupported language",
      });
    }

    console.log(
      "Translation request:",
      text,
      language
    );

    const results = await Promise.all(
      targets.map(async (targetLanguage) => {
        const response = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TTS_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: text,
              source: sourceLanguage,
              target: targetLanguage,
              format: "text",
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error(
            "Translation error:",
            data
          );

          throw new Error(
            data?.error?.message ||
            "Translation request failed"
          );
        }

        const translatedText =
          data?.data?.translations?.[0]
            ?.translatedText;

        return {
          language: targetLanguage,
          languageName:
            languageNames[targetLanguage],
          text:
            translatedText ||
            "",
        };
      })
    );

    res.json({
      originalText: text,
      sourceLanguage,
      translations: results,
    });

  } catch (error) {
    console.error(
      "Translation error:",
      error
    );

    res.status(500).json({
      error:
        error.message ||
        "번역 중 오류가 발생했습니다.",
    });
  }
});


app.listen(3001, () => {
  console.log(
    "TTS server running on http://localhost:3001"
  );
});