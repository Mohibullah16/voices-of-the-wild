# Cloud listener on Modal: the same Node server (server.mjs) in a container with the model baked in.
#   modal deploy listener/modal_app.py
# Sleeps when idle (no cost); the first photo after a pause wakes it (~15-30 s).
import subprocess
from pathlib import Path

import modal

HERE = Path(__file__).parent

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
    )
    .add_local_file(HERE / "package.json", "/app/package.json", copy=True)
    .add_local_file(HERE / "package-lock.json", "/app/package-lock.json", copy=True)
    .run_commands("cd /app && npm ci --omit=dev && npm cache clean --force")
    .add_local_file(HERE / "prefetch.mjs", "/app/prefetch.mjs", copy=True)
    .env({"MODEL_CACHE": "/app/.model-cache", "NODE_ENV": "production"})
    .run_commands("cd /app && node prefetch.mjs")  # bake the pinned q4 weights into the image
    .add_local_file(HERE / "server.mjs", "/app/server.mjs", copy=True)
)

app = modal.App("votw-listener", image=image)


@app.function(memory=2048, cpu=2.0, scaledown_window=600, timeout=300)
@modal.concurrent(max_inputs=8)
@modal.web_server(7860, startup_timeout=180)
def listener():
    subprocess.Popen(["node", "server.mjs"], cwd="/app", env={
        "PORT": "7860",
        "MODEL_CACHE": "/app/.model-cache",
        "NODE_ENV": "production",
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "ALLOWED_ORIGINS": "https://voices-of-the-wild.netlify.app,http://localhost:5173,http://localhost:4173",
    })
