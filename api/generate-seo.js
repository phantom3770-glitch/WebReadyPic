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
    return res.status(500).json({ error: 'GEMINI_API_KEY не задан в Environment Variables проекта' });
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
    const rawBase64 = body && (body.image || body.imageBase64);
    const cleanBase64 = rawBase64 ? rawBase64.replace(/^data:image\/\w+;base64,/, '') : null;
    const mimeType = (body && body.mimeType) || 'image/jpeg';
    const lang = (body && body.lang) || 'ru';

    if (!promptText) {
      return res.status(400).json({ error: 'Промпт обязателен для генерации.' });
    }

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            ...(cleanBase64 ? [{ inlineData: { mimeType: mimeType, data: cleanBase64 } }] : [])
          ]
        }
      ]
    };

    const models = [
      'gemini-flash-latest',
      'gemini-2.0-flash',
      'gemini-flash-lite-latest',
      'gemini-2.0-flash-lite'
    ];

    let successData = null;
    let lastErrorStatus = null;
    let lastErrorMessage = '';
    let hasQuotaError = false;

    for (const MODEL_NAME of models) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        const message = errorData.error?.message || response.statusText || '';

        if (response.ok && errorData.candidates && errorData.candidates[0]) {
          successData = errorData;
          break;
        }

        lastErrorStatus = status;
        lastErrorMessage = message;

        const isQuota = (status === 429) || (message && (message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED')));
        if (isQuota) {
          hasQuotaError = true;
        }

        if (status === 401) {
          break;
        }
      } catch (err) {
        lastErrorStatus = 500;
        lastErrorMessage = err.message;
      }
    }

    if (successData) {
      return res.status(200).json(successData);
    }

    if (hasQuotaError) {
      const friendlyErrorMessages = {
        ru: 'Лимит бесплатных запросов ИИ временно исчерпан. Пожалуйста, подождите 1 минуту и попробуйте снова.',
        ua: 'Ліміт безкоштовних запитів ШІ тимчасово вичерпано. Будь ласка, зачекайте 1 хвилину та спробуйте знову.',
        en: 'AI free request limit temporarily reached. Please wait 1 minute and try again.'
      };
      const userFriendlyMsg = friendlyErrorMessages[lang] || friendlyErrorMessages.ru;
      return res.status(429).json({ error: userFriendlyMsg });
    }

    return res.status(lastErrorStatus || 500).json({
      error: `Ошибка API (${lastErrorStatus || 500}): ${lastErrorMessage || 'Неизвестная ошибка'}`
    });

  } catch (error) {
    console.error('Ошибка в Vercel Function (api/generate-seo.js):', error);
    return res.status(500).json({
      error: 'Внутренняя ошибка сервера при обращении к Gemini API',
      details: error.message
    });
  }
};
