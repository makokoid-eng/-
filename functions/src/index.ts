import * as functions from "firebase-functions";
import axios from "axios";
import * as admin from "firebase-admin";

// admin 初期化は一度だけ
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** 受信→即返信（動作確認用） */
export const lineWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const events = req.body?.events || [];

  for (const e of events) {
    if (e.type === "message" && e.message.type === "text") {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: e.replyToken,
          messages: [{ type: "text", text: `受け取りました：${e.message.text}` }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${functions.config().line.token}`,
          },
        }
      );
    }
  }
  return res.sendStatus(200);
});

/** モック生成API（3案返す） */
export const generateDiary = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const { theme = "", toneHint = "ふわっと" } = req.body ?? {};
  if (!theme) return res.status(400).json({ error: "theme is required" });

  const t = String(theme).trim();
  const tail =
    toneHint === "大人"
      ? "静かな余韻をそっと置いておく。"
      : toneHint === "語尾弱め"
      ? "気持ちは短く、伝わるように。"
      : "また重なるタイミングを楽しみに。";

  const variants = [
    `空気がやわらぐ${t}。深呼吸で整える夜。${tail}`,
    `灯りの粒が静かに揺れる${t}。無理のない歩幅で。${tail}`,
    `${t}。言葉少なめの方が届く夜もある。${tail}`,
  ];
  return res.json({ variants });
});

/** 保存API：visit + draft を同時に作成 */
export const saveDiary = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  try {
    const body = (req.body ?? {}) as {
      userId?: string;
      customer?: { nickname?: string };
      memo?: string;
      tags?: string[];
      theme: string;
      strength: "soft" | "normal" | "hard";
      emojiLevel: number;
      toneHint: string;
      draftText: string;
    };

    const headerUid = (req.headers["x-mock-uid"] as string) || undefined;
    const uid = body.userId || headerUid || "demo";

    if (!body.theme || !body.draftText) {
      return res
        .status(400)
        .json({ error: "theme and draftText are required" });
    }

    // visits へ保存
    const visitRef = await db
      .collection("users")
      .doc(uid)
      .collection("visits")
      .add({
        customerNickname: body.customer?.nickname ?? null,
        memo: body.memo ?? null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        theme: body.theme,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // diary_drafts へ保存
    const draftRef = await db
      .collection("users")
      .doc(uid)
      .collection("diary_drafts")
      .add({
        sourceVisitId: visitRef.id,
        draftText: body.draftText,
        toneHint: body.toneHint,
        strength: body.strength,
        emojiLevel: body.emojiLevel,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return res.json({ ok: true, visitId: visitRef.id, draftId: draftRef.id });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "internal error" });
  }
});
