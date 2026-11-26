require('dotenv').config();

const provider = (process.env.PROVIDER || 'bedrock').trim().toLowerCase();

if (provider === 'bedrock') {
  console.log('Starting OCR server with provider: bedrock (server.js)');
  require('./server.js');
} else if (provider === 'openrouter') {
  console.log('Starting OCR server with provider: openrouter (server-open_router.js)');
  require('./server-open_router.js');
} else {
  console.error(
    `Invalid PROVIDER="${process.env.PROVIDER}". Expected "bedrock" or "openrouter".`
  );
  process.exit(1);
}

