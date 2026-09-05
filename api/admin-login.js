export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(401).json({
        error: "비밀번호가 필요합니다.",
      });
    }

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error(
        "ADMIN_PASSWORD 환경변수가 없습니다."
      );

      return res.status(500).json({
        error:
          "관리자 비밀번호가 서버에 설정되지 않았습니다.",
      });
    }

    if (password !== adminPassword) {
      return res.status(401).json({
        error: "비밀번호가 올바르지 않습니다.",
      });
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "관리자 로그인 오류:",
      error
    );

    return res.status(500).json({
      error: "관리자 로그인 중 오류가 발생했습니다.",
    });
  }
}
