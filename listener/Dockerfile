# Hugging Face Space (Docker SDK). Port 7860, non-root user 1000.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.mjs prefetch.mjs ./
ENV MODEL_CACHE=/app/.model-cache PORT=7860 NODE_ENV=production
# Bake the model into the image so a cold start doesn't download 316 MB.
RUN node prefetch.mjs && chown -R 1000:1000 /app
USER 1000
EXPOSE 7860
CMD ["node", "server.mjs"]
