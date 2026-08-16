import type { ServerMsg } from './protocol';

const TOKEN_KEY = 'dct-player-token';

/** The device's claim token, minted once and kept in localStorage. */
export function deviceToken(): string {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

/**
 * WebSocket client with auto-reconnect. On every (re)connect it says hello
 * with the stored token so a claimed device re-attaches to its character.
 */
export class PlayerSocket {
  private socket: WebSocket | null = null;
  private retryDelay = 1000;
  private closed = false;

  constructor(
    private onMessage: (msg: ServerMsg) => void,
    private onStatus: (connected: boolean) => void,
  ) {}

  connect(): void {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.retryDelay = 1000;
      this.onStatus(true);
      this.send({ type: 'hello', token: deviceToken() });
    };
    socket.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerMsg);
      } catch {
        // Ignore malformed frames.
      }
    };
    socket.onclose = () => {
      this.onStatus(false);
      if (this.closed) return;
      setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 10000);
    };
    socket.onerror = () => socket.close();
  }

  send(msg: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closed = true;
    this.socket?.close();
  }
}
