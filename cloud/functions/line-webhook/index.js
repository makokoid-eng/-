// smoke
export const app = (req, res) => {
  if (req.method === 'GET') {
    res.status(200).send('alive');
    return;
  }

  if (req.method === 'POST') {
    res.status(200).send('ok');
    return;
  }

  res.status(405).send('Method Not Allowed');
};
