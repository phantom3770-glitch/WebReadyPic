module.exports = async function handler(req, res) {
  // Настройка CORS заголовков
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка предварительного запроса (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Разрешаем только POST-запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Only POST requests are supported.' });
  }

  // Безопасное получение API-ключа из переменных окружения Vercel
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Конфигурационная ошибка сервера: Переменная окружения GEMINI_API_KEY не задана.'
    });
  }

  try {
    // Получение тела запроса (поддержка строки JSON или распарсенного объекта)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Оставляем как строку, если это простой текстовый промпт
      }
    }

    // Формирование структуры тела для Gemini API
    // Поддержка как прямого передачи структуры Gemini ({ contents: [...] }),
    // так и упрощенного промпта / мультимодальных данных.
    let payload;
    if (body && body.contents) {
      payload = body;
    } else if (body && body.prompt) {
      payload = {
        contents: [
          {
            parts: [
              { text: body.prompt },
              ...(body.image ? [{ inlineData: { mimeType: body.mimeType || 'image/jpeg', data: body.image } }] : [])
            ]
          }
        ]
      };
    } else if (typeof body === 'string') {
      payload = {
        contents: [{ parts: [{ text: body }] }]
      };
    } else {
      payload = body;
    }

    // URL для основной модели и fallback
    const primaryUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let response = await fetch(primaryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Fallback на gemini-1.5-flash в случае если gemini-3-flash-preview недоступна
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      const fallbackResponse = await fetch(fallbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (fallbackResponse.ok) {
        response = fallbackResponse;
      }
    }

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Ошибка выполнения запроса к Gemini API',
        details: data
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Ошибка в Serverless Function (api/gemini.js):', error);
    return res.status(500).json({
      error: 'Внутренняя ошибка сервера при обращении к Gemini API',
      details: error.message
    });
  }
};
