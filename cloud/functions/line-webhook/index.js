
import crypto from 'node:crypto';

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
          if (!message || message.type !== 'image' || !message.id) {
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
