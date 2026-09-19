#!/usr/bin/env python3
"""
SyncWatch Local LLM CLI Query Tool
----------------------------------
One-shot prompt executor for offline inference using RTX 2050 GPU offload.
Useful for offline summaries, test generation, and Antigravity subagent offloading.
"""

import os
import sys
import argparse
from llama_cpp import Llama

DEFAULT_MODEL = os.path.expanduser(r"~\OneDrive\Desktop\Startups\jarvis-native\models\qwen2.5-3b-instruct-q4_k_m.gguf")

def main():
    parser = argparse.ArgumentParser(description="Query local LLM via CLI")
    parser.add_argument("prompt", type=str, help="Prompt text to send")
    parser.add_argument("--system", type=str, default="You are a concise, tactical engineering assistant.", help="System prompt")
    parser.add_argument("--max-tokens", type=int, default=256, help="Max tokens to generate")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Model path")
    args = parser.parse_args()

    if not os.path.exists(args.model):
        print(f"Error: Model not found at {args.model}", file=sys.stderr)
        sys.exit(1)

    llm = Llama(model_path=args.model, n_gpu_layers=-1, n_ctx=2048, verbose=False)
    messages = [
        {"role": "system", "content": args.system},
        {"role": "user", "content": args.prompt}
    ]

    res = llm.create_chat_completion(messages=messages, max_tokens=args.max_tokens)
    print(res["choices"][0]["message"]["content"].strip())

if __name__ == "__main__":
    main()
