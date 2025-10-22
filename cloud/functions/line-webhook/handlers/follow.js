export async function handleFollow({
  event,
  res,
  fetchLineProfile,
  db,
  FieldValue,
  FIRESTORE_ROOT,
  replyLine,
}) {
  const userId = event?.source?.userId;
  console.log('stage: follow event received, userId=', userId);

  if (!userId) {
    console.warn('stage: follow handler skipped - userId missing');
    return res.status(200).send('ok');
  }

  try {
    const profile = await fetchLineProfile(userId);
    const payload = {
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection(FIRESTORE_ROOT).doc(userId).set(payload, { merge: true });
    console.log('stage: follow profile saved');
  } catch (error) {
    console.error('stage: follow handler error', error?.message || error);
  }

  const replyToken = event?.replyToken;

  if (replyToken) {
    const followMessage = [
      '友だち追加ありがとう！📸 写真を送るとAIが要約して履歴に保存します。',
      '🧾「履歴」= 直近7日のまとめ',
      '🔁「ping save」= 保存テスト',
      '※ 未友だちやグループは個人IDが取れないため、まずはこのトークで友だち状態にしてね。',
    ].join('\n');
    const replyStatus = await replyLine(replyToken, followMessage);
    console.log('reply status=', replyStatus);
  }

  return res.status(200).send('ok');
}
