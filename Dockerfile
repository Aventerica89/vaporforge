# VaporForge Sandbox - Cloudflare Container
# Based on official cloudflare/sandbox-sdk/examples/claude-code pattern
FROM docker.io/cloudflare/sandbox:0.7.0

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install Agent SDK globally + in /opt/claude-agent (keeps /workspace clean for user projects)
RUN npm install -g @anthropic-ai/claude-agent-sdk@latest ws && \
    mkdir -p /opt/claude-agent && cd /opt/claude-agent && npm init -y && npm install @anthropic-ai/claude-agent-sdk@latest
ENV NODE_PATH=/usr/local/lib/node_modules

# Install essential dev tools (keep minimal to avoid disk/build issues)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    gpg \
    && rm -rf /var/lib/apt/lists/*

# Install 1Password CLI for service account secret access
# Sandbox Claude can run: op read "op://App Dev/SECRET_NAME/credential"
RUN curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
    gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main" > \
    /etc/apt/sources.list.d/1password.list && \
    apt-get update && apt-get install -y 1password-cli && \
    rm -rf /var/lib/apt/lists/*

# Increase command timeout for AI responses (5 min)
ENV COMMAND_TIMEOUT_MS=300000
ENV VF_CONTAINER_BUILD=20260301a

# Create workspace directory
RUN mkdir -p /workspace

# Copy SDK wrapper scripts into /opt/claude-agent (not /workspace)
# Source of truth: src/sandbox-scripts/ — keep files there in sync with these COPYs
COPY src/sandbox-scripts/claude-agent.js /opt/claude-agent/claude-agent.js
RUN chmod +x /opt/claude-agent/claude-agent.js

COPY src/sandbox-scripts/mcp-relay-proxy.js /opt/claude-agent/mcp-relay-proxy.js
RUN chmod +x /opt/claude-agent/mcp-relay-proxy.js

COPY src/sandbox-scripts/gemini-mcp-server.js /opt/claude-agent/gemini-mcp-server.js
RUN chmod +x /opt/claude-agent/gemini-mcp-server.js

COPY src/sandbox-scripts/ws-agent-server.js /opt/claude-agent/ws-agent-server.js
RUN chmod +x /opt/claude-agent/ws-agent-server.js

COPY src/sandbox-scripts/groq-background-agent.js /opt/claude-agent/groq-background-agent.js
RUN chmod +x /opt/claude-agent/groq-background-agent.js

COPY src/sandbox-scripts/gather-context.sh /opt/claude-agent/gather-context.sh
RUN chmod +x /opt/claude-agent/gather-context.sh
