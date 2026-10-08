---
title: Voices of the Wild listener
emoji: 🌿
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: EmbeddingGemma 2 photo embeddings for Voices of the Wild
---

# Voices of the Wild: cloud listener

A tiny server for [Voices of the Wild](https://voices-of-the-wild.netlify.app). Phones that can't hold
EmbeddingGemma 2 on their GPU send a downscaled photo here and get back its 768-number embedding.
Same open model (`onnx-community/embeddinggemma-2-ONNX`, q4, pinned revision) as the on-device path.

- `POST /embed` with JPEG bytes → `{ vector: number[768], ms }`
- `GET /health`

Photos are decoded in memory and dropped. Nothing is stored or logged. Matching, voices and the
collection stay on the phone. Source: https://github.com/Mohibullah16/voices-of-the-wild/tree/main/listener

## Deploy

```bash
modal deploy listener/modal_app.py      # 2 GB, 2 vCPU, sleeps after 10 idle minutes; model baked into the image
LISTENER=https://<workspace>--votw-listener-listener.modal.run npx tsx app/tools/listener-check.ts
```

The `Dockerfile` runs the same server anywhere else (it was written for a Hugging Face Docker Space, which now needs PRO).
