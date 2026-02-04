# Claude Cloud Sandbox Dockerfile
# Based on Cloudflare Sandbox image with development tools

FROM docker.io/cloudflare/sandbox:0.7.0

# Install additional development tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    vim \
    nano \
    tree \
    jq \
    ripgrep \
    fd-find \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install common global packages
RUN npm install -g \
    typescript \
    ts-node \
    pnpm \
    yarn \
    prettier \
    eslint \
    vitest \
    @anthropic-ai/claude-code

# Install Python tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /workspace && chmod 755 /workspace

# Copy skills
COPY skills/ /opt/claude-cloud/skills/

# Set environment variables
ENV NODE_ENV=production
ENV WORKSPACE=/workspace
ENV PATH="/opt/claude-cloud/bin:$PATH"

# Set working directory
WORKDIR /workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Default command
CMD ["tail", "-f", "/dev/null"]
