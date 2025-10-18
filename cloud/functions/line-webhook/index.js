
import crypto from 'node:crypto';
import OpenAI from 'openai';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

const getRawBodyBuffer = (req) => {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(req.rawBody, 'utf8');
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  if (req.body) {
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }

  return Buffer.from('', 'utf8');
};

const isValidSignature = (req) => {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const signatureHeader = req.get
    ? req.get('x-line-signature')
    : req.headers?.['x-line-signature'];

  if (!channelSecret || !signatureHeader) {
    return false;
  }

  const rawBody = getRawBodyBuffer(req);
  const expectedSignature = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest();

  try {
    const signature = Buffer.from(signatureHeader, 'base64');

    return (
      signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(signature, expectedSignature)
    );
  } catch (error) {
    return false;
  }
};


// smoke
export const app = (req, res) => {
  if (req.method === 'GET') {
    res.status(200).send('alive');
    return;
  }

  if (req.method === 'POST') {
    if (!isValidSignature(req)) {
      res.status(403).send('invalid signature');
      return;
    }

    (async () => {
      try {
        const body =
          typeof req.body === 'string'
            ? JSON.parse(req.body || '{}')
            : req.body ?? {};
        const events = Array.isArray(body?.events) ? body.events : [];

        for (const event of events) {
          const message = event?.message;
          const replyToken = event?.replyToken;

          if (!replyToken || !message || message.type !== 'image' || !message.id) {
            continue;
          }

          const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
          if (!accessToken) {
            throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
          }

          const response = await fetch(
            `https://api-data.line.me/v2/bot/message/${encodeURIComponent(
              message.id,
            )}/content`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch image content: ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          console.log(`image_data_url_length=${dataUrl.length}`);

          let replyText = '処理でエラーが起きました🙏';
          let parseFailure = false;

          try {
            if (!openaiClient) {
              throw new Error('OPENAI_API_KEY is not set');
            }

            console.log('calling openai vision for line message', message.id);
            const aiResponse = await openaiClient.responses.create({
              model: 'gpt-4o-mini',
              input: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: [
                        'あなたは管理栄養士です。',
                        '提供された食事画像を分析し、以下の仕様に沿って短い日本語コメントと構造化JSONを返してください。',
                        'JSON構造:',
                        '{',
                        '  "food_items": ["食べ物名", ...],',
                        '  "estimates": {',
                        '    "calorie_kcal": 数値,',
                        '    "protein_g": 数値,',
                        '    "fat_g": 数値,',
                        '    "carb_g": 数値',
                        '  },',
                        '  "quality": 0から5の整数,',
                        '  "advice": "短い日本語コメント"',
                        '}',
                        '短い説明文に続いて必ず上記JSONを一度だけ出力してください。',
                      ].join('\n'),
                    },
                    {
                      type: 'input_image',
                      image_url: dataUrl,
                    },
                  ],
                },
              ],
            });

            const outputText =
              aiResponse?.output_text ??
              (Array.isArray(aiResponse?.output)
                ? aiResponse.output
                    .flatMap((item) =>
                      Array.isArray(item?.content)
                        ? item.content
                            .map((contentItem) =>
                              typeof contentItem?.text === 'string'
                                ? contentItem.text
                                : '',
                            )
                            .join('')
                        : '',
                    )
                    .join('\n')
                : '');
            const firstBrace = outputText.indexOf('{');
            const lastBrace = outputText.lastIndexOf('}');

            if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
              parseFailure = true;
              throw new Error('No JSON object in model response');
            }

            let parsed;
            try {
              parsed = JSON.parse(outputText.slice(firstBrace, lastBrace + 1));
            } catch (error) {
              parseFailure = true;
              throw error;
            }

            const foodItems = Array.isArray(parsed?.food_items)
              ? parsed.food_items.map((item) => String(item).trim()).filter(Boolean)
              : [];
            const estimates = parsed?.estimates ?? {};

            const toNumberText = (value) => {
              const num = typeof value === 'number' ? value : Number.parseFloat(value);
              return Number.isFinite(num) ? Math.round(num * 10) / 10 : '-';
            };

            const foodItemsText = foodItems.length > 0 ? foodItems.join(', ') : '不明';
            const calorieText = toNumberText(estimates.calorie_kcal);
            const proteinText = toNumberText(estimates.protein_g);
            const fatText = toNumberText(estimates.fat_g);
            const carbText = toNumberText(estimates.carb_g);
            const adviceText = parsed?.advice ? String(parsed.advice).trim() : '特になし';

            replyText = [
              '解析結果🍽',
              `- 想定: ${foodItemsText}`,
              `- 推定: ${calorieText} kcal / P:${proteinText}g F:${fatText}g C:${carbText}g`,
              `- コメント: ${adviceText}`,
            ].join('\n');
          } catch (error) {
            if (parseFailure) {
              replyText = '画像を解析できませんでした🙇';
            }

            console.error('line webhook vision processing error', error);
          }

          try {
            const replyResponse = await fetch('https://api.line.me/v2/bot/message/reply', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                replyToken,
                messages: [
                  {
                    type: 'text',
                    text: replyText,
                  },
                ],
              }),
            });

            if (!replyResponse.ok) {
              throw new Error(`Failed to send LINE reply: ${replyResponse.status}`);
            }
          } catch (error) {
            console.error('line webhook reply error', error);
          }
        }
      } catch (error) {
        console.error('line webhook error', error);
      }
    })()
      .catch((error) => {
        console.error('unexpected line webhook error', error);
      })
      .finally(() => {
        res.status(200).send('ok');
      });
    return;
  }

  res.status(405).send('Method Not Allowed');
};
