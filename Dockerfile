FROM node:20-alpine

# Install Ghostscript for PDF to Image conversion
RUN apk add --no-cache ghostscript

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
