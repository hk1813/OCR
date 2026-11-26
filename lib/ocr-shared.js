const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { execFile } = require('child_process');
const util = require('util');

const execFilePromise = util.promisify(execFile);

const UPLOAD_DIR = '/tmp/ocr-uploads/';
const MAX_PDF_PAGES = 8;
const REQUEST_TIMEOUT_MS = 300000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Failed to remove temp file ${filePath}:`, err.message);
  }
}

function createUploadMiddleware() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  return multer({ dest: UPLOAD_DIR });
}

function createBaseApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

/**
 * Convert an uploaded PDF or image into OpenAI-compatible multimodal message content.
 * @param {Express.Multer.File} file
 * @param {string} prompt
 * @param {string[]} tempFiles
 */
async function buildMessagesContent(file, prompt, tempFiles) {
  const mimeType = file.mimetype || 'application/octet-stream';
  const isPdf =
    mimeType === 'application/pdf' ||
    path.extname(file.originalname || '').toLowerCase() === '.pdf';
  const isImage = mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    throw new HttpError(400, 'Unsupported file type. Please upload a PDF or image.');
  }

  const fileBuffer = fs.readFileSync(file.path);
  let totalPages = 1;

  const strictPrefix = `INSTRUCTIONS: You are a strict document data extraction assistant. ONLY return the specific data asked for — nothing more. Do NOT add explanations, commentary, or filler text. If asked for a specific field, return ONLY that value. If asked for all data, return everything. Be clean, concise, and exact.

USER REQUEST: `;

  const messagesContent = [
    {
      type: 'text',
      text: strictPrefix + prompt,
    },
  ];

  if (isPdf) {
    let pdfText = '';
    let pdfParsed = false;
    try {
      const pdfData = await pdfParse(fileBuffer);
      totalPages = pdfData.numpages || 1;
      pdfText = pdfData.text || '';
      pdfParsed = true;
      console.log(`Processing PDF: ${totalPages} pages found.`);
    } catch (err) {
      console.warn('pdf-parse failed, continuing with Ghostscript image conversion:', err.message);
    }

    const maxPages = pdfParsed ? Math.min(totalPages, MAX_PDF_PAGES) : MAX_PDF_PAGES;
    const gsArgs = [
      '-dNOPAUSE',
      '-dBATCH',
      '-sDEVICE=jpeg',
      '-dJPEGQ=60',
      `-dLastPage=${maxPages}`,
      '-r90',
      `-sOutputFile=${file.path}-%d.jpg`,
      file.path,
    ];

    let convertedPages = 0;
    try {
      await execFilePromise('gs', gsArgs);
      for (let i = 1; i <= maxPages; i++) {
        const pagePath = `${file.path}-${i}.jpg`;
        if (fs.existsSync(pagePath)) {
          tempFiles.push(pagePath);
          const imageBase64 = fs.readFileSync(pagePath).toString('base64');
          messagesContent.push({
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          });
          convertedPages++;
        }
      }
      if (!pdfParsed && convertedPages > 0) {
        totalPages = convertedPages;
      }
      console.log(`Successfully converted ${convertedPages} PDF pages to JPEG.`);
    } catch (gsErr) {
      console.error('Ghostscript conversion failed, falling back to text only:', gsErr.message);
    }

    if (convertedPages === 0 && pdfText.trim().length === 0) {
      throw new HttpError(400, 'Failed to process PDF. Ensure it is a valid document.');
    }

    if (pdfText.trim().length > 0) {
      messagesContent.push({
        type: 'text',
        text: `\n\n--- EXTRACTED TEXT FROM ALL PAGES ---\n${pdfText}\n--------------------------------------`,
      });
    }
  } else {
    const base64Data = fileBuffer.toString('base64');
    messagesContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Data}`,
      },
    });
  }

  return { messagesContent, mimeType, totalPages };
}

function resolveCompletionsUrl(baseUrl) {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  if (cleanBaseUrl.endsWith('/chat/completions')) {
    return cleanBaseUrl;
  }
  return cleanBaseUrl.endsWith('/v1')
    ? `${cleanBaseUrl}/chat/completions`
    : `${cleanBaseUrl}/v1/chat/completions`;
}

async function callChatCompletions({ apiUrl, apiKey, modelName, messagesContent, providerName }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  console.log(`Calling ${providerName} API at: ${apiUrl} with model: ${modelName}`);

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: messagesContent,
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error(`Non-JSON response from ${providerName} API:`, response.status, rawText.slice(0, 500));
    throw new HttpError(502, `Upstream API returned invalid JSON (HTTP ${response.status}).`);
  }

  console.log(`${providerName} response:`, JSON.stringify(data, null, 2));

  if (!response.ok || data.error) {
    const errMsg =
      data.error?.message ||
      data.error?.metadata?.raw ||
      (data.error ? JSON.stringify(data.error) : `HTTP ${response.status}`);
    console.error('API Error:', errMsg);
    throw new HttpError(response.ok ? 500 : response.status, errMsg);
  }

  return data;
}

function logUsage({ mimeType, totalPages, usage }) {
  if (!usage) return;
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || 0;

  const inputCost = (promptTokens / 1_000_000) * 0.05;
  const outputCost = (completionTokens / 1_000_000) * 0.09;
  const totalCost = inputCost + outputCost;

  console.log('\n--- Usage & Cost ---');
  console.log(`File Type    : ${mimeType}`);
  console.log(`Total Pages  : ${totalPages}`);
  console.log(`Input Tokens : ${promptTokens} ($${inputCost.toFixed(6)})`);
  console.log(`Output Tokens: ${completionTokens} ($${outputCost.toFixed(6)})`);
  console.log(`Total Tokens : ${totalTokens}`);
  console.log(`Total Cost   : $${totalCost.toFixed(6)}`);
  console.log('--------------------\n');
}

/**
 * Create an Express handler for POST /api/extract bound to a provider config loader.
 */
function createExtractHandler({ providerName, getConfig }) {
  return async (req, res) => {
    const file = req.file;
    const tempFiles = file?.path ? [file.path] : [];

    try {
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const { apiKey, baseUrl, modelName } = getConfig();
      const prompt = req.body.prompt || 'Extract all text and data from this document.';

      const { messagesContent, mimeType, totalPages } = await buildMessagesContent(
        file,
        prompt,
        tempFiles
      );

      const apiUrl = resolveCompletionsUrl(baseUrl);
      const data = await callChatCompletions({
        apiUrl,
        apiKey,
        modelName,
        messagesContent,
        providerName,
      });

      logUsage({ mimeType, totalPages, usage: data.usage });

      const extractedText = data.choices?.[0]?.message?.content || 'No data extracted.';
      return res.json({ result: extractedText });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Extraction error:', err);
      return res.status(500).json({ error: err.message });
    } finally {
      tempFiles.forEach(safeUnlink);
    }
  };
}

module.exports = {
  HttpError,
  createBaseApp,
  createExtractHandler,
  createUploadMiddleware,
};

