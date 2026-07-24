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
        body: JSON.stringify({ error: 'GEMINI_API_KEY не задан в Environment Variables проекта' })
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
    const rawBase64 = body.image || body.imageBase64;
    const cleanBase64 = rawBase64 ? rawBase64.replace(/^data:image\/\w+;base64,/, '') : null;
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
            ...(cleanBase64 ? [{ inlineData: { mimeType: mimeType, data: cleanBase64 } }] : [])
          ]
        }
      ]
    };

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-8b-latest'];
    let successData = null;
    let lastErrorStatus = null;
    let lastErrorMessage = '';
    let allErrorsAreQuota = true;

    for (const model of models) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

        const isQuotaError = (status === 429) || (message && (message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED')));
        if (!isQuotaError) {
          allErrorsAreQuota = false;
          break;
        }
      } catch (err) {
        lastErrorStatus = 500;
        lastErrorMessage = err.message;
        allErrorsAreQuota = false;
        break;
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

    if (allErrorsAreQuota) {
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
        body: JSON.stringify({ error: userFriendlyMsg })
      };
    }

    return {
      statusCode: lastErrorStatus || 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: `Ошибка API (${lastErrorStatus || 500}): ${lastErrorMessage || 'Неизвестная ошибка'}` })
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
