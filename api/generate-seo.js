module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Only POST requests are supported.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Переменная окружения GEMINI_API_KEY не задана на сервере.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Leave as string if parsing fails
      }
    }

    const promptText = (body && (body.prompt || body.promptText)) || '';
    const base64Image = body && (body.image || body.imageBase64);
    const mimeType = (body && body.mimeType) || 'image/jpeg';

    if (!promptText) {
      return res.status(400).json({ error: 'Промпт обязателен для генерации.' });
    }

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            ...(base64Image ? [{ inlineData: { mimeType: mimeType, data: base64Image } }] : [])
          ]
        }
      ]
    };

    const primaryUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let response = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok && (response.status === 404 || response.status === 400)) {
      const fallbackResponse = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (fallbackResponse.ok) {
        response = fallbackResponse;
      }
    }

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || `Ошибка Gemini API (${response.status})`,
        details: data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Ошибка в Vercel Function (api/generate-seo.js):', error);
    return res.status(500).json({
      error: 'Внутренняя ошибка сервера при обращении к Gemini API',
      details: error.message
    });
  }
};
