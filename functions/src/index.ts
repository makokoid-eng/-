import * as functions from "firebase-functions";
import axios from "axios";
import * as admin from "firebase-admin";
if (!admin.apps.length) admin.initializeApp();

export const lineWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
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
  res.sendStatus(200);
});

type SaveDiaryRequestBody = {
  userId?: string;
  customer?: { nickname?: string };
  memo?: string;
  tags?: string[];
  theme: string;
  strength: number;
  emojiLevel: number;
  toneHint: string;
  draftText: string;
};

export const saveDiary = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const body = (req.body || {}) as SaveDiaryRequestBody;
    const uid = body.userId || req.get("x-mock-uid") || "demo";
    const db = admin.firestore();
    const userDoc = db.collection("users").doc(uid);
    const visitRef = userDoc.collection("visits").doc();
    const draftRef = userDoc.collection("diary_drafts").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const tags = Array.isArray(body.tags) ? body.tags : [];
    const customerNickname = body.customer?.nickname;

    const batch = db.batch();
    batch.set(visitRef, {
      theme: body.theme,
      strength: body.strength,
      emojiLevel: body.emojiLevel,
      toneHint: body.toneHint,
      memo: body.memo ?? null,
      tags,
      draftId: draftRef.id,
      customerNickname: customerNickname ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    batch.set(draftRef, {
      draftText: body.draftText,
      theme: body.theme,
      strength: body.strength,
      emojiLevel: body.emojiLevel,
      toneHint: body.toneHint,
      memo: body.memo ?? null,
      tags,
      customerNickname: customerNickname ?? null,
      visitId: visitRef.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await batch.commit();

    res.json({ ok: true, visitId: visitRef.id, draftId: draftRef.id });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
