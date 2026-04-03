#!/bin/sh
ollama serve &
sleep 5
ollama pull qwen2.5-coder:7b
wait