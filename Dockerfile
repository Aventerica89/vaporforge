# VaporForge Sandbox - Cloudflare Container
# Based on official cloudflare/sandbox-sdk/examples/claude-code pattern
FROM docker.io/cloudflare/sandbox:0.7.0

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install essential dev tools (keep minimal to avoid disk/build issues)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Increase command timeout for AI responses (5 min)
ENV COMMAND_TIMEOUT_MS=300000

# Create workspace directory
RUN mkdir -p /workspace
