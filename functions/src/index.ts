import * as functions from "firebase-functions";
import axios from "axios";
import * as admin from "firebase-admin";
if (!admin.apps.length) admin.initializeApp();

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
