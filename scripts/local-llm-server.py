#!/usr/bin/env python3
"""
SyncWatch Local LLM Neural Core Server
--------------------------------------
Serves local GGUF models via FastAPI with GPU acceleration (RTX 2050).
Compatible with OpenAI /v1/chat/completions API format.
"""

import os
import sys
import time
import argparse
from typing import List, Optional, Dict, Any

# Force dedicated NVIDIA RTX 2050 (Device 0) over integrated AMD Radeon APU
os.environ.setdefault("GGML_VK_DEVICE", "0")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import uvicorn
    from llama_cpp import Llama
except ImportError as e:
    print(f"Error: Missing required dependency ({e}). Run: pip install llama-cpp-python fastapi uvicorn pydantic")
    sys.exit(1)

# Default model locations
DEFAULT_MODELS = [
    os.path.expanduser(r"~\OneDrive\Desktop\Startups\jarvis-native\models\qwen2.5-3b-instruct-q4_k_m.gguf"),
    os.path.expanduser(r"~\Desktop\Startups\jarvis-native\models\qwen2.5-3b-instruct-q4_k_m.gguf"),
    os.path.join(os.path.dirname(__file__), "..", "models", "qwen2.5-3b-instruct-q4_k_m.gguf")
]

def find_model_path(custom_path: Optional[str] = None) -> str:
    if custom_path and os.path.exists(custom_path):
        return custom_path
    for p in DEFAULT_MODELS:
        normalized = os.path.abspath(p)
        if os.path.exists(normalized):
            return normalized
    return ""

app = FastAPI(title="SyncWatch Local Neural Core", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global LLM instance
llm_instance: Optional[Llama] = None
model_name: str = "qwen2.5-3b-instruct"
active_model_path: str = ""

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "qwen2.5-3b-instruct"
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 512
    stream: Optional[bool] = False

@app.get("/health")
@app.get("/api/status")
def get_status():
    return {
        "status": "ready" if llm_instance else "uninitialized",
        "model": model_name,
        "model_path": active_model_path,
        "gpu_offload": True,
        "engine": "llama-cpp-python"
    }

@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": model_name,
                "object": "model",
                "owned_by": "local",
                "permission": []
            }
        ]
    }

@app.post("/v1/chat/completions")
def chat_completions(req: ChatCompletionRequest):
    global llm_instance
    if not llm_instance:
        raise HTTPException(status_code=503, detail="Local LLM is not loaded.")

    try:
        # Convert Pydantic messages to standard dicts
        messages_dict = [{"role": m.role, "content": m.content} for m in req.messages]

        start_time = time.time()
        response = llm_instance.create_chat_completion(
            messages=messages_dict,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            stream=False
        )
        elapsed = time.time() - start_time

        prompt_tokens = response.get("usage", {}).get("prompt_tokens", 0)
        completion_tokens = response.get("usage", {}).get("completion_tokens", 0)
        tps = (completion_tokens / elapsed) if elapsed > 0 else 0

        # Inject speed metadata in header or custom field
        response["speed"] = {
            "elapsed_seconds": round(elapsed, 3),
            "tokens_per_second": round(tps, 1)
        }
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def start_server():
    parser = argparse.ArgumentParser(description="SyncWatch Local Neural Core Runner")
    parser.add_argument("--model", type=str, default="", help="Path to GGUF model")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--gpu-layers", type=int, default=-1, help="GPU layers to offload (-1 for all)")
    parser.add_argument("--ctx-size", type=int, default=4096, help="Context window size")
    args = parser.parse_args()

    global llm_instance, active_model_path, model_name
    active_model_path = find_model_path(args.model)
    if not active_model_path:
        print("Error: No valid GGUF model file found. Specify with --model <path_to_gguf>")
        sys.exit(1)

    model_name = os.path.splitext(os.path.basename(active_model_path))[0]
    print(f"Loading local model: {active_model_path}")
    print(f"Targeting GPU layers: {args.gpu_layers} (Full VRAM offload on RTX 2050)")

    llm_instance = Llama(
        model_path=active_model_path,
        n_gpu_layers=args.gpu_layers,
        n_threads=6,
        n_ctx=args.ctx_size,
        verbose=False
    )
    print(f"Model loaded successfully! Neural core listening on http://{args.host}:{args.port}")

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")

if __name__ == "__main__":
    start_server()
