FROM node:20-alpine

WORKDIR /app

# Copy only the packages needed for relay
COPY packages/shared ./packages/shared
COPY packages/relay ./packages/relay

# Create a minimal package.json for deployment
RUN echo '{"name":"claude-remote-deploy","private":true,"workspaces":["packages/shared","packages/relay"]}' > package.json

# Install dependencies
RUN npm install

# Build shared first, then relay
RUN cd packages/shared && npm run build
RUN cd packages/relay && npm run build

# Set working directory to relay
WORKDIR /app/packages/relay

# Expose port (Railway uses PORT env var)
EXPOSE 3000

# Start the relay server
CMD ["node", "dist/index.js"]
