FROM node:18-slim

RUN apt-get update && apt-get install -y python3 python3-pip curl ffmpeg && \
    pip3 install --break-system-packages -U yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
