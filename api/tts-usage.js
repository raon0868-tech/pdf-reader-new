export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();

    const month = new Date().toISOString().slice(0, 7);

    const characters = Number(
      (await redis.get(`tts:chars:${month}`)) || 0
    );

    return res.status(200).json({
      month,
      characters,
      limit: 1000000,
    });
  } catch (error) {
    console.error("TTS 사용량 조회 오류:", error);
    return res.status(500).json({
      error: "사용량을 불러오는 중 오류가 발생했습니다.",
    });
  }
}
