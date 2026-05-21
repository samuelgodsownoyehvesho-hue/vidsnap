export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const API_KEY = 'sk_live_697723ebb316f09ccbd5ce1d72e572f1';
  const BASE = 'https://api.sociavault.com/v1/scrape';

  try {
    let endpoint, params;
    const u = decodeURIComponent(url);

    if (/tiktok\.com/i.test(u)) {
      endpoint = `${BASE}/tiktok/video`;
      params = new URLSearchParams({ url: u });
    } else if (/instagram\.com/i.test(u)) {
      endpoint = `${BASE}/instagram/post`;
      params = new URLSearchParams({ url: u });
    } else if (/twitter\.com|x\.com/i.test(u)) {
      const match = u.match(/status\/(\d+)/);
      if (!match) return res.status(400).json({ error: 'Invalid Twitter URL' });
      endpoint = `${BASE}/twitter/tweet`;
      params = new URLSearchParams({ tweet_id: match[1] });
    } else if (/youtube\.com|youtu\.be/i.test(u)) {
      endpoint = `${BASE}/youtube/video`;
      params = new URLSearchParams({ url: u });
    } else {
      return res.status(400).json({ error: 'Platform not supported' });
    }

    const response = await fetch(`${endpoint}?${params}`, {
      headers: { 'X-API-Key': API_KEY }
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
