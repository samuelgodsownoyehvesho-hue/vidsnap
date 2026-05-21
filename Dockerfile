FROM node:20-slim

# Install yt-dlp dependencies: Python, ffmpeg, curl
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080

ENV PORT=8080

CMD ["node", "server.js"]
