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

# Install and build relay (link to shared)
WORKDIR /app/packages/relay
RUN npm install
# Link shared package manually
RUN rm -rf node_modules/@claude-remote/shared && \
    mkdir -p node_modules/@claude-remote && \
    ln -s /app/packages/shared node_modules/@claude-remote/shared
RUN npm run build

# Expose port
EXPOSE 3000

# Start the relay server
CMD ["node", "dist/index.js"]
