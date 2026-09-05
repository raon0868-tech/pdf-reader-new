import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const voices = {
  "en-US": "en-US-Chirp3-HD-Kore",
  "da-DK": "da-DK-Chirp3-HD-Kore",
  "ko-KR": "ko-KR-Chirp3-HD-Kore",
  "ja-JP": "ja-JP-Chirp3-HD-Kore",
  "fr-FR": "fr-FR-Chirp3-HD-Kore",
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

    const voiceName = voices[language];

    if (!voiceName) {
      return res.status(400).json({
        error: "지원하지 않는 언어입니다.",
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
            text,
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
      return res.status(response.status).json({
        error:
          data.error?.message ||
          "Google TTS 요청에 실패했습니다.",
      });
    }

    // Google TTS 요청이 성공한 경우에만 사용량 기록
    try {
      const today = new Date();

      const year = today.getUTCFullYear();
      const month = String(today.getUTCMonth() + 1).padStart(2, "0");

      const usageKey = `tts:chars:${year}-${month}`;

      const characterCount = Array.from(text).length;

      await redis.incrby(usageKey, characterCount);
    } catch (usageError) {
      // 사용량 기록에 문제가 생겨도 TTS 자체는 정상적으로 작동하도록 함
      console.error("TTS 사용량 기록 오류:", usageError);
    }

    return res.status(200).json({
      audioContent: data.audioContent,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "음성 합성 중 오류가 발생했습니다.",
    });
  }
}