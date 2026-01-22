import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface Session {
  id: string;
  name: string;
  workingDirectory: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
}

interface SessionState {
  session: Session;
  isFirstMessage: boolean;
  claudeProcess: ChildProcess | null;
  responseBuffer: string;
}

interface WSMessage {
  type: string;
  [key: string]: any;
}

export class ClaudeService extends EventEmitter {
  private relayUrl: string;
  private allowedDirs: string[];
  private defaultDir: string;
  private ws: WebSocket | null = null;
  private deviceId: string;
  private pairCode: string | null = null;
  private paired = false;
  private currentPairId: string | null = null;
  private sessions: Map<string, SessionState> = new Map();
  private activeSessionId: string | null = null;
  private claudePath: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(relayUrl: string, allowedDirs: string[]) {
    super();
    this.relayUrl = relayUrl;
    this.allowedDirs = allowedDirs.length > 0 ? allowedDirs : [process.cwd()];
    this.defaultDir = this.allowedDirs[0];
    this.deviceId = `desktop-${Date.now()}`;
    this.claudePath = process.env.CLAUDE_PATH || (process.env.HOME + '/.local/bin/claude');
  }

  async start(): Promise<void> {
    // Check Claude CLI availability
    await this.checkClaudeCLI();

    // Connect WebSocket
    await this.connectWebSocket();

    // Request pair code
    await this.requestPairCode();

    // Start heartbeat
    this.startHeartbeat();
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Clean up all sessions
    for (const state of this.sessions.values()) {
      if (state.claudeProcess) {
        state.claudeProcess.kill();
      }
    }
    this.sessions.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.paired = false;
    this.currentPairId = null;
    this.emit('status', { connected: false, paired: false });
  }

  getStatus() {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      paired: this.paired,
      pairCode: this.pairCode,
      pairId: this.currentPairId,
      allowedDirs: this.allowedDirs,
      sessions: this.getSessions(),
    };
  }

  private async checkClaudeCLI(): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = spawn('claude', ['--version'], { shell: true });
      check.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Claude CLI not found. Please install Claude Code CLI.'));
        }
      });
      check.on('error', () => {
        reject(new Error('Claude CLI not found. Please install Claude Code CLI.'));
      });
    });
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Convert HTTP(S) to WS(S)
      let wsUrl = this.relayUrl.replace(/^http/, 'ws');
      // Use 127.0.0.1 instead of localhost to avoid IPv6 issues (only for local URLs)
      if (wsUrl.includes('localhost')) {
        wsUrl = wsUrl.replace('localhost', '127.0.0.1');
      }
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.emit('status', { connected: true, paired: false });
        this.ws!.send(JSON.stringify({
          type: 'auth',
          token: `${this.deviceId}:Desktop Claude:desktop`
        }));
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as WSMessage;
        this.handleWebSocketMessage(msg, resolve, reject);
      });

      this.ws.on('close', () => {
        this.emit('status', { connected: false, paired: false });
        this.paired = false;
      });

      this.ws.on('error', (err) => {
        this.emit('error', err.message);
        reject(err);
      });
    });
  }

  private async requestPairCode(): Promise<void> {
    // Use 127.0.0.1 instead of localhost to avoid IPv6 issues
    const httpUrl = this.relayUrl.replace(/^ws/, 'http').replace('localhost', '127.0.0.1');
    const response = await fetch(`${httpUrl}/api/pair/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: this.deviceId,
        deviceName: 'Desktop Claude',
        platform: 'desktop'
      }),
    });

    const data = await response.json();
    if (data.success) {
      this.pairCode = data.data.pairCode;
      this.emit('pairCode', this.pairCode);
    } else {
      throw new Error(data.error || 'Failed to get pair code');
    }
  }

  private handleWebSocketMessage(msg: WSMessage, resolve?: () => void, reject?: (err: Error) => void): void {
    switch (msg.type) {
      case 'auth_success':
        this.emit('status', { connected: true, paired: false });
        resolve?.();
        break;

      case 'auth_error':
        this.emit('error', `Auth failed: ${msg.error}`);
        reject?.(new Error(msg.error));
        break;

      case 'paired':
        this.paired = true;
        if (this.currentPairId !== msg.pairId) {
          this.currentPairId = msg.pairId;
          this.initDefaultSession();
        }
        this.emit('paired', msg.pairId);
        this.emit('status', { connected: true, paired: true });
        this.sendSessionList();
        break;

      case 'unpaired':
        this.paired = false;
        this.currentPairId = null;
        this.emit('unpaired');
        this.emit('status', { connected: true, paired: false });
        break;

      case 'peer_offline':
        this.emit('status', { connected: true, paired: true, peerOnline: false });
        break;

      case 'message':
        this.handleUserMessage(msg.payload);
        break;

      case 'session_create':
        this.handleSessionCreate(msg);
        break;

      case 'session_switch':
        this.handleSessionSwitch(msg);
        break;

      case 'session_delete':
        this.handleSessionDelete(msg);
        break;

      case 'pong':
        break;
    }
  }

  private initDefaultSession(): void {
    this.sessions.clear();
    this.createSession(this.defaultDir);
  }

  private createSession(workingDirectory?: string, name?: string): Session {
    const targetDir = path.resolve(workingDirectory || this.defaultDir);

    if (!this.isDirectoryAllowed(targetDir)) {
      throw new Error(`Directory not allowed: ${targetDir}`);
    }

    if (!fs.existsSync(targetDir)) {
      throw new Error(`Directory does not exist: ${targetDir}`);
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const sessionName = name || path.basename(targetDir);

    const session: Session = {
      id: sessionId,
      name: sessionName,
      workingDirectory: targetDir,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0,
    };

    const state: SessionState = {
      session,
      isFirstMessage: true,
      claudeProcess: null,
      responseBuffer: '',
    };

    this.sessions.set(sessionId, state);

    if (this.sessions.size === 1) {
      this.activeSessionId = sessionId;
    }

    this.emit('sessions', this.getSessions());
    return session;
  }

  private getSessions(): Session[] {
    return Array.from(this.sessions.values())
      .map(s => s.session)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  private isDirectoryAllowed(targetDir: string): boolean {
    const normalized = path.resolve(targetDir);
    for (const allowed of this.allowedDirs) {
      const normalizedAllowed = path.resolve(allowed);
      if (normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + path.sep)) {
        return true;
      }
    }
    return false;
  }

  private handleUserMessage(payload: { content: string; sessionId?: string }): void {
    const { content, sessionId } = payload;

    this.emit('message', { from: 'user', content, sessionId });

    // Parse commands
    const command = this.parseCommand(content);
    if (command) {
      this.handleCommand(command, sessionId || this.activeSessionId || '');
      return;
    }

    // Send to Claude
    const targetSessionId = sessionId || this.activeSessionId;
    if (targetSessionId) {
      this.sendToClaudeSession(targetSessionId, content);
    }
  }

  private parseCommand(content: string): { type: string; args?: string } | null {
    const lower = content.toLowerCase().trim();

    if (lower.startsWith('新建会话') || lower.startsWith('创建会话') ||
        lower.startsWith('new session') || lower.startsWith('create session')) {
      const match = content.match(/(?:在|at|in)\s*(.+)/i);
      return { type: 'new_session', args: match?.[1]?.trim() };
    }

    if (lower.startsWith('cd ') || lower.startsWith('chdir ') ||
        lower.startsWith('进入目录') || lower.startsWith('工作目录改为') ||
        lower.startsWith('迁移到') || lower.startsWith('切换到') ||
        lower.startsWith('移到') || lower.startsWith('去')) {
      let args = content.replace(/^(cd|chdir|进入目录|工作目录改为|迁移到|切换到|移到|去)\s*/i, '').trim();
      const migrateMatch = content.match(/(?:迁移到|移到|切换到|去)\s*(.+?)(?:目录|里面|下面|文件夹)?$/i);
      if (migrateMatch) args = migrateMatch[1].trim();
      return { type: 'change_dir', args };
    }

    if (lower === '列出会话' || lower === 'list sessions' ||
        lower === '会话列表' || lower === 'sessions') {
      return { type: 'list_sessions' };
    }

    return null;
  }

  private handleCommand(command: { type: string; args?: string }, sessionId: string): void {
    switch (command.type) {
      case 'new_session': {
        try {
          const session = this.createSession(command.args);
          this.sendToPhone(`✅ Created session: ${session.name}\nDirectory: ${session.workingDirectory}`, session.id);
          this.sendSessionList();
        } catch (error) {
          this.sendToPhone(`❌ Failed: ${(error as Error).message}`, sessionId);
        }
        break;
      }

      case 'change_dir': {
        try {
          const state = this.sessions.get(sessionId);
          if (!state) throw new Error('Session not found');

          let targetDir = command.args || '';
          if (!path.isAbsolute(targetDir)) {
            targetDir = path.resolve(state.session.workingDirectory, targetDir);
          }

          if (!this.isDirectoryAllowed(targetDir)) {
            throw new Error(`Directory not allowed: ${targetDir}`);
          }

          if (!fs.existsSync(targetDir)) {
            throw new Error(`Directory does not exist: ${targetDir}`);
          }

          state.session.workingDirectory = targetDir;
          state.session.name = path.basename(targetDir);
          state.session.lastActiveAt = Date.now();

          this.sendToPhone(`✅ Working directory changed to: ${targetDir}`, sessionId);
          this.sendSessionList();
        } catch (error) {
          this.sendToPhone(`❌ Failed: ${(error as Error).message}`, sessionId);
        }
        break;
      }

      case 'list_sessions': {
        const sessions = this.getSessions();
        let msg = '📋 Sessions:\n';
        for (const session of sessions) {
          const isActive = session.id === this.activeSessionId ? ' ⬅️' : '';
          msg += `\n• ${session.name}${isActive}\n  ${session.workingDirectory}\n  Messages: ${session.messageCount}`;
        }
        this.sendToPhone(msg, sessionId);
        break;
      }
    }
  }

  private sendToClaudeSession(sessionId: string, message: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      this.sendToPhone(`Session not found: ${sessionId}`, sessionId);
      return;
    }

    if (state.claudeProcess) {
      this.sendToPhone('Claude is processing, please wait...', sessionId);
      return;
    }

    const { session } = state;
    state.responseBuffer = '';

    const args = ['-p', message];
    if (!state.isFirstMessage) {
      args.push('--continue');
    }
    args.push('--dangerously-skip-permissions');

    state.claudeProcess = spawn(this.claudePath, args, {
      cwd: session.workingDirectory,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    state.claudeProcess.stdout?.on('data', (data) => {
      state.responseBuffer += data.toString();
    });

    state.claudeProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      if (!text.includes('ExperimentalWarning') && !text.includes('punycode')) {
        state.responseBuffer += text;
      }
    });

    state.claudeProcess.on('close', (code) => {
      if (state.responseBuffer.trim()) {
        this.sendToPhone(state.responseBuffer.trim(), session.id);

        if (code === 0) {
          state.isFirstMessage = false;
          session.messageCount++;
          session.lastActiveAt = Date.now();
        }
      } else if (code !== 0) {
        this.sendToPhone(`Claude process error (code: ${code})`, session.id);
      }

      state.claudeProcess = null;
      state.responseBuffer = '';
      this.emit('sessions', this.getSessions());
    });

    state.claudeProcess.on('error', (err) => {
      this.sendToPhone(`Failed to start Claude: ${err.message}`, session.id);
      state.claudeProcess = null;
    });
  }

  private sendToPhone(content: string, sessionId?: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const payload = {
      id: Date.now().toString(),
      content,
      timestamp: Date.now(),
      sessionId: sessionId || this.activeSessionId || 'default',
    };

    this.ws.send(JSON.stringify({ type: 'message', payload }));
    this.emit('message', { from: 'claude', content, sessionId });
  }

  private sendSessionList(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: 'session_list',
      sessions: this.getSessions(),
      activeSessionId: this.activeSessionId,
      baseDirectory: this.defaultDir,
    }));
  }

  private handleSessionCreate(msg: any): void {
    try {
      const session = this.createSession(msg.workingDirectory, msg.name);
      this.ws?.send(JSON.stringify({ type: 'session_created', session }));
      this.sendSessionList();
    } catch (error) {
      this.ws?.send(JSON.stringify({
        type: 'session_error',
        error: (error as Error).message
      }));
    }
  }

  private handleSessionSwitch(msg: any): void {
    const state = this.sessions.get(msg.sessionId);
    if (state) {
      this.activeSessionId = msg.sessionId;
      state.session.lastActiveAt = Date.now();
      this.ws?.send(JSON.stringify({ type: 'session_switched', session: state.session }));
    } else {
      this.ws?.send(JSON.stringify({ type: 'session_error', error: 'Session not found' }));
    }
  }

  private handleSessionDelete(msg: any): void {
    const state = this.sessions.get(msg.sessionId);
    if (state) {
      if (state.claudeProcess) {
        state.claudeProcess.kill();
      }
      this.sessions.delete(msg.sessionId);

      if (this.activeSessionId === msg.sessionId) {
        const remaining = Array.from(this.sessions.keys());
        this.activeSessionId = remaining.length > 0 ? remaining[0] : null;
      }

      this.ws?.send(JSON.stringify({ type: 'session_deleted', sessionId: msg.sessionId }));
      this.sendSessionList();
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }
}
