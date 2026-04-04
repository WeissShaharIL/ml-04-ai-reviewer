#!/bin/sh
ollama serve &
sleep 5

# Create a Modelfile with increased context
cat > /tmp/Modelfile << 'EOF'
FROM qwen2.5-coder:7b
PARAMETER num_ctx 16384
EOF

ollama pull qwen2.5-coder:7b
ollama create qwen2.5-coder-review -f /tmp/Modelfile
wait