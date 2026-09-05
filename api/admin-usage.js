export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { password } = req.body || {};
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!password || !adminPassword || password !== adminPassword) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();

    const month = new Date().toISOString().slice(0, 7);

    const ttsCharacters =
      (await redis.get(`tts:chars:${month}`)) || 0;

    const translateCharacters =
      (await redis.get(`translate:chars:${month}`)) || 0;

    return res.status(200).json({
      month,
      tts: {
        characters: Number(ttsCharacters),
        limit: 1000000,
      },
      translate: {
        characters: Number(translateCharacters),
        limit: 500000,
      },
    });
  } catch (error) {
    console.error("관리자 사용량 조회 오류:", error);
    return res.status(500).json({
      error: "사용량을 불러오는 중 오류가 발생했습니다.",
    });
  }
}
