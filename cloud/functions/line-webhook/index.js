
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

    res.status(200).send('ok');
    return;
  }

  res.status(405).send('Method Not Allowed');
};
