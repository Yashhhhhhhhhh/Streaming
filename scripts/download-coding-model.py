#!/usr/bin/env python3
"""
SyncWatch Coding Model Downloader
---------------------------------
Downloads the official Qwen2.5-Coder-3B-Instruct quantized GGUF model
from Hugging Face into the local models directory.
"""

import os
import sys

try:
    from huggingface_hub import hf_hub_download
except ImportError:
    print("Error: huggingface_hub is required. Run: pip install huggingface-hub")
    sys.exit(1)

TARGET_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
REPO_ID = "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF"
FILENAME = "qwen2.5-coder-3b-instruct-q4_k_m.gguf"

def download_model():
    os.makedirs(TARGET_DIR, exist_ok=True)
    target_path = os.path.join(TARGET_DIR, FILENAME)

    if os.path.exists(target_path):
        print(f"Model already exists at: {target_path}")
        return target_path

    print(f"Downloading {FILENAME} from {REPO_ID}...")
    print(f"Destination: {target_path}")
    print("This is a ~2.0 GB download. The model is optimized for 100% RTX 2050 VRAM offload at 42 t/s.")

    downloaded = hf_hub_download(
        repo_id=REPO_ID,
        filename=FILENAME,
        local_dir=TARGET_DIR,
        local_dir_use_symlinks=False
    )
    print(f"Download complete: {downloaded}")
    return downloaded

if __name__ == "__main__":
    download_model()
