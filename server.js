require('dotenv').config();
const {
  HttpError,
  createBaseApp,
  createExtractHandler,
  createUploadMiddleware,
} = require('./lib/ocr-shared');

const PORT = process.env.PORT || 3000;
const DEFAULT_MODEL = 'google.gemma-3-4b-it';

const app = createBaseApp();
const upload = createUploadMiddleware();

app.post(
  '/api/extract',
  upload.single('file'),
  createExtractHandler({
    providerName: 'Bedrock',
    getConfig: () => {
      const apiKey = process.env.Bedrock_API_KEY;
      const baseUrl = process.env.OPENAI_BASE_URL;
      const modelName = process.env.Model_Name || DEFAULT_MODEL;

      if (!apiKey) {
        throw new HttpError(
          500,
          'Bedrock API key not configured. Set Bedrock_API_KEY in .env file.'
        );
      }

      if (!baseUrl) {
        throw new HttpError(
          500,
          'Base URL not configured. Set OPENAI_BASE_URL in .env file.'
        );
      }

      return { apiKey, baseUrl, modelName };
    },
  })
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Using Bedrock Model: ${process.env.Model_Name || DEFAULT_MODEL}`);
});
