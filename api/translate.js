import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const languageCodes = {
  "en-US": "en",
  "da-DK": "da",
  "ko-KR": "ko",
  "ja-JP": "ja",
  "fr-FR": "fr",
};

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { text, language } = req.body;

    if (!text || !language) {
      return res.status(400).json({
        error: "text와 language가 필요합니다.",
      });
    }

    const sourceLanguage = languageCodes[language];
    const targets = targetLanguages[language];

    if (!sourceLanguage || !targets) {
      return res.status(400).json({
        error: "지원하지 않는 언어입니다.",
      });
    }

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
          throw new Error(
            data.error?.message ||
              "Google Translation 요청에 실패했습니다."
          );
        }

        try {
          const today = new Date();

          const year = today.getUTCFullYear();
          const month = String(
            today.getUTCMonth() + 1
          ).padStart(2, "0");

          const usageKey =
            `translate:chars:${year}-${month}`;

          const characterCount =
            Array.from(text).length;

          await redis.incrby(
            usageKey,
            characterCount
          );
        } catch (usageError) {
          console.error(
            "번역 사용량 기록 오류:",
            usageError
          );
        }

        return {
          language: languageNames[targetLanguage],
          text:
            data.data.translations[0].translatedText,
        };
      })
    );

    return res.status(200).json({
      translations: results,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error.message ||
        "번역 중 오류가 발생했습니다.",
    });
  }
}
