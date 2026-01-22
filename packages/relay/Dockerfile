FROM node:20-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY turbo.json ./

# Copy packages
COPY packages/shared ./packages/shared
COPY packages/relay ./packages/relay

# Install dependencies
RUN npm ci --only=production

# Build shared first, then relay
RUN npm run build:shared
RUN npm run build:relay

# Set working directory to relay
WORKDIR /app/packages/relay

# Expose ports
EXPOSE 3000 3001

# Start the relay server
CMD ["node", "dist/index.js"]
