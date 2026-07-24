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
    const lang = (body && body.lang) || 'ru';

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

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    let successData = null;
    let lastErrorDetails = null;

    for (const model of models) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.candidates && data.candidates[0]) {
          successData = data;
          break; // Успешно сгенерировано текущей моделью
        }

        lastErrorDetails = data;
      } catch (err) {
        lastErrorDetails = { error: { message: err.message } };
      }
    }

    if (successData) {
      return res.status(200).json(successData);
    }

    // Человекочитаемые ошибки при исчерпании лимитов всех моделей
    const friendlyErrorMessages = {
      ru: 'Лимит бесплатных запросов ИИ временно исчерпан. Пожалуйста, подождите 1 минуту и попробуйте снова.',
      ua: 'Ліміт безкоштовних запитів ШІ тимчасово вичерпано. Будь ласка, зачекайте 1 хвилину та спробуйте знову.',
      en: 'AI free request limit temporarily reached. Please wait 1 minute and try again.'
    };

    const userFriendlyMsg = friendlyErrorMessages[lang] || friendlyErrorMessages.ru;

    return res.status(429).json({
      error: userFriendlyMsg,
      details: lastErrorDetails
    });

  } catch (error) {
    console.error('Ошибка в Vercel Function (api/generate-seo.js):', error);
    return res.status(500).json({
      error: 'Внутренняя ошибка сервера при обращении к Gemini API',
      details: error.message
    });
  }
};
