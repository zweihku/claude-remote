FROM node:20-alpine

WORKDIR /app

# Copy shared package
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/

# Copy relay package
COPY packages/relay/package.json ./packages/relay/
COPY packages/relay/src ./packages/relay/src
COPY packages/relay/public ./packages/relay/public
COPY packages/relay/tsconfig.json ./packages/relay/

# Install and build shared
WORKDIR /app/packages/shared
RUN npm install
RUN npm run build

# Modify relay package.json to use local shared package
WORKDIR /app/packages/relay
RUN sed -i 's|"@claude-remote/shared": "\*"|"@claude-remote/shared": "file:../shared"|g' package.json

# Install relay dependencies
RUN npm install

# Build relay
RUN npm run build

# Expose port
EXPOSE 3000

# Start the relay server
CMD ["node", "dist/index.js"]
