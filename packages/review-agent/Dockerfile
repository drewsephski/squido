FROM node:22-slim

# Runtime deps for future static analyzer integrations (git for semgrep, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Standalone bundle — includes all deps, no node_modules needed
COPY dist/review-action-bundle.js ./action.js

# Entry point
ENTRYPOINT ["node", "/app/action.js"]
