# Document OCR & Data Extraction App

A powerful tool to upload documents (PDFs) or images and extract structured data using Amazon Bedrock AI. It supports multi-page PDFs by converting them to images using Ghostscript and sending extracted text as a fallback.

## Features

- **PDF Support**: Handles multi-page PDFs (converts first 8 pages to images for vision processing).
- **Vision & Text OCR**: Uses Amazon Bedrock models for high-accuracy extraction.
- **Cost Tracking**: Logs token usage and estimated costs in the server console.
- **Strict Data Extraction**: Specialized system prompts to ensure clean, concise results.

## Setup

### 1. Configure Environment Variables

Copy `.env.example` to `.env` in the project root and set your credentials:

```bash
cp .env.example .env
```

```env
# Choose provider: bedrock | openrouter
PROVIDER=bedrock
PORT=3000

# Amazon Bedrock (used when PROVIDER=bedrock)
Bedrock_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://bedrock-mantle.ap-south-1.api.aws/v1
Model_Name=google.gemma-3-4b-it

# OpenRouter (used when PROVIDER=openrouter)
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_MODEL=google/gemma-3-4b-it
```

- Set `PROVIDER=bedrock` to run `server.js` (Amazon Bedrock).
- Set `PROVIDER=openrouter` to run `server-open_router.js` (OpenRouter).

---

### 2. Run with Docker (Recommended)

Docker handles all dependencies, including **Ghostscript** for PDF processing.

```bash
docker compose up --build
```

App runs at **http://localhost:9090** (mapped to container port `3000`)

**Stop:**
```bash
docker compose down
```

---

### 3. Run Locally

Ensure you have **Ghostscript** installed on your system if you want to process PDFs.

```bash
# Install dependencies
npm install

# Start the server (uses PROVIDER from .env)
npm start
```

App runs at **http://localhost:3000**

## API Usage

### `POST /api/extract`

Accepts a multipart form-data request:
- `file`: The document or image (PDF, PNG, JPG).
- `prompt`: (Optional) Custom extraction instructions.

**Example Response:**
```json
{
  "result": "Extracted data content..."
}
```
