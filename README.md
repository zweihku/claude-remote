# Claude Remote

Control [Claude Code CLI](https://github.com/anthropics/claude-code) from your mobile device.

Claude Remote lets you send prompts to Claude Code running on your desktop from your phone's browser. Perfect for coding on the go, reviewing code from your couch, or pair programming with AI from anywhere.

## How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Mobile    │ ──────▶ │ Relay Server │ ──────▶ │   Desktop   │
│  (Browser)  │ ◀────── │   (Cloud)    │ ◀────── │ (Claude CLI)│
└─────────────┘         └──────────────┘         └─────────────┘
```

1. **Desktop App** connects to the relay server and gets a 4-digit pairing code
2. **Mobile Browser** opens the relay server URL and enters the pairing code
3. Messages are relayed between mobile and desktop in real-time
4. Claude Code CLI executes commands locally on your desktop

## Quick Start

### Step 1: Deploy Relay Server (Railway)

1. Create a [Railway](https://railway.app) account
2. Click **New Project** → **Deploy from GitHub repo**
3. Connect this repository
4. Railway auto-detects the Dockerfile and deploys
5. Go to **Settings** → **Networking** → **Generate Domain**
6. Note your URL: `https://<project>.up.railway.app`

### Step 2: Download Desktop App

Download from [Releases](../../releases):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `Claude.Remote-arm64.app.zip` |
| macOS (Intel) | `Claude.Remote-x64.app.zip` |

**First launch**: Right-click → Open (to bypass Gatekeeper)

### Step 3: Connect

**On Desktop:**
1. Open `Claude Remote.app`
2. Enter your relay server URL (e.g., `https://xxx.up.railway.app`)
3. Add directories Claude can access
4. Click **Connect**
5. A 4-digit pairing code appears

**On Mobile:**
1. Open the same relay server URL in your browser
2. Enter the 4-digit pairing code
3. Start chatting with Claude!

## Alternative Deployment

### Docker

```bash
docker build -t claude-remote .
docker run -p 3000:3000 claude-remote
```

### Manual

```bash
# Build shared package
cd packages/shared
npm install && npm run build

# Build and run relay server
cd ../relay
npm install && npm run build
npm start
```

### Other Cloud Platforms

The Dockerfile works with any platform supporting containers:
- [Render](https://render.com)
- [Fly.io](https://fly.io)
- [Google Cloud Run](https://cloud.google.com/run)
- [AWS App Runner](https://aws.amazon.com/apprunner/)

## Project Structure

```
claude-remote/
├── packages/
│   ├── relay/          # Relay server (deploy this)
│   │   ├── src/        # Server source code
│   │   └── public/     # Mobile web UI
│   └── shared/         # Shared constants
├── release/            # Pre-built desktop apps
├── Dockerfile          # For cloud deployment
└── README.md
```

## Features

- **Multi-session support** - Work on multiple projects simultaneously
- **Directory access control** - Restrict Claude's file access
- **Custom server URL** - Use your own relay server
- **Real-time sync** - Instant message relay via WebSocket
- **Mobile-optimized UI** - Designed for touch and virtual keyboard
- **Session persistence** - Continue where you left off

## Security

- All communication over HTTPS/WSS (encrypted)
- Pairing codes expire after 5 minutes
- Claude CLI runs locally - your code never leaves your machine
- Relay server is stateless - no message storage
- You control your own relay server

## Requirements

- **Desktop**: macOS (Apple Silicon / Intel)
- **Mobile**: Any modern browser (Safari, Chrome, Firefox)
- **Server**: Node.js 18+ or Docker

## Development

```bash
# Install dependencies
npm install

# Build all packages
cd packages/shared && npm install && npm run build
cd ../relay && npm install && npm run build

# Run relay server locally
cd packages/relay && npm run dev
```

## FAQ

**Q: Can multiple people use the same relay server?**
A: Yes, each pairing code creates an isolated connection.

**Q: Is my code uploaded to the relay server?**
A: No, Claude CLI runs locally. Only messages pass through the relay.

**Q: What if the pairing code expires?**
A: Click Disconnect and Connect again for a new code.

**Q: Can I use this without deploying a server?**
A: No, you need your own relay server. This ensures you control your data.

## License

MIT

## Credits

Built for use with [Claude Code](https://github.com/anthropics/claude-code) by Anthropic.
