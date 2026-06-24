// Cloudflare Worker - Gemini APIプロキシ（フィットネスアプリ）
// 環境変数: GEMINI_API_KEY, APP_TOKEN, ALLOWED_ORIGIN を設定すること

export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '*';

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // ① Originチェック
    const origin = request.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    // ② トークンチェック
    const token = request.headers.get('X-App-Token');
    if (!env.APP_TOKEN || token !== env.APP_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const body = await request.json();
      const { type, imageBase64, mimeType, workoutText } = body;

      let prompt = "";
      const parts = [];

      if (type === "meal") {
        if (imageBase64) {
          parts.push({
            inline_data: {
              mime_type: mimeType || "image/jpeg",
              data: imageBase64
            }
          });
        }
        prompt = `この食事の写真を見て、栄養成分を分析してください。必ず以下のJSON形式のみで返してください。マークダウンや説明文は一切不要です。

{
  "dishes": [{"name":"料理名","amount":"量の推定"}],
  "nutrition": {"protein":数値,"carbs":数値,"fat":数値,"calories":数値},
  "confidence": "high",
  "comment": "50代男性の筋トレ目的での一言アドバイス",
  "protein_rating": "不足"
}

protein、carbs、fat、caloriesは必ず整数の数値で返してください。文字列ではなく数値です。`;

      } else if (type === "workout") {
        prompt = `以下の筋トレメニューを分析してください。必ず以下のJSON形式のみで返してください。マークダウンや説明文は一切不要です。

${workoutText}

{
  "muscle_groups": ["大胸筋","上腕三頭筋"],
  "recovery_days": 2,
  "intensity": "標準",
  "advice": "アドバイスのテキスト",
  "protein_needed": 30
}

recovery_daysとprotein_neededは必ず整数の数値で返してください。`;
      }

      parts.push({ text: prompt });

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: "application/json"
            }
          }),
        }
      );

      const geminiData = await geminiRes.json();

      if (!geminiData.candidates) {
        throw new Error("Gemini APIエラー: " + JSON.stringify(geminiData));
      }

      const text = geminiData.candidates[0].content.parts[0].text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      return new Response(JSON.stringify(parsed), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
      });
    }
  },
};
