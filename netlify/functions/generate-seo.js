exports.handler = async (event) => {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method Not Allowed. Only POST requests are supported.' })
    };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Переменная окружения GEMINI_API_KEY не настроена на сервере Netlify.' })
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Неверный формат JSON в теле запроса.' })
      };
    }

    const promptText = body.prompt || body.promptText;
    const base64Image = body.image || body.imageBase64;
    const mimeType = body.mimeType || 'image/jpeg';
    const lang = body.lang || 'ru';

    if (!promptText) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Промпт обязателен для генерации.' })
      };
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
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(successData)
      };
    }

    // Человекочитаемые ошибки при исчерпании лимитов всех моделей
    const friendlyErrorMessages = {
      ru: 'Лимит бесплатных запросов ИИ временно исчерпан. Пожалуйста, подождите 1 минуту и попробуйте снова.',
      ua: 'Ліміт безкоштовних запитів ШІ тимчасово вичерпано. Будь ласка, зачекайте 1 хвилину та спробуйте знову.',
      en: 'AI free request limit temporarily reached. Please wait 1 minute and try again.'
    };

    const userFriendlyMsg = friendlyErrorMessages[lang] || friendlyErrorMessages.ru;

    return {
      statusCode: 429,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: userFriendlyMsg,
        details: lastErrorDetails
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
