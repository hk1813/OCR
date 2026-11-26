require('dotenv').config();
const {
  HttpError,
  createBaseApp,
  createExtractHandler,
  createUploadMiddleware,
} = require('./lib/ocr-shared');

const PORT = process.env.PORT || 3000;
const DEFAULT_MODEL = 'google/gemma-3-4b-it';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const app = createBaseApp();
const upload = createUploadMiddleware();

app.post(
  '/api/extract',
  upload.single('file'),
  createExtractHandler({
    providerName: 'OpenRouter',
    getConfig: () => {
      const apiKey = process.env.OPENROUTER_API_KEY;
      const baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL;
      const modelName = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

      if (
        !apiKey ||
        apiKey === 'your_openrouter_api_key_here' ||
        apiKey === 'your-openrouter-api-key-here'
      ) {
        throw new HttpError(
          500,
          'OpenRouter API key not configured. Set OPENROUTER_API_KEY in .env file.'
        );
      }

      return { apiKey, baseUrl, modelName };
    },
  })
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Using OpenRouter Model: ${process.env.OPENROUTER_MODEL || DEFAULT_MODEL}`);
});
