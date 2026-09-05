import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const today = new Date();

    const year = today.getUTCFullYear();
    const month = String(
      today.getUTCMonth() + 1
    ).padStart(2, "0");

    const usageKey =
      `translate:chars:${year}-${month}`;

    const usage = await redis.get(usageKey);

    return res.status(200).json({
      month: `${year}-${month}`,
      characters: Number(usage || 0),
    });
  } catch (error) {
    console.error("번역 사용량 조회 오류:", error);

    return res.status(500).json({
      error: "번역 사용량을 불러올 수 없습니다.",
    });
  }
}
