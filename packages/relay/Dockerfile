FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY turbo.json ./

# Copy packages
COPY packages/shared ./packages/shared
COPY packages/relay ./packages/relay

# Install all dependencies (including devDependencies for build)
RUN npm install

# Build shared first, then relay
RUN npm run build -w @claude-remote/shared
RUN npm run build -w @claude-remote/relay

# Set working directory to relay
WORKDIR /app/packages/relay

# Expose port (Railway uses PORT env var)
EXPOSE 3000

# Start the relay server
CMD ["node", "dist/index.js"]
