// WebSocketブリッジ: 外部ツール(自動操作・テスト等)からWebNP2を遠隔操作するための最小プロトコル。
// メッセージ形式は {id, cmd, args} を受け取り、{id, ok, result} または {id, ok:false, error} を返す。

import type { KeyStep, WebNP2 } from './webnp2.ts';

interface IncomingMessage {
  id?: unknown;
  cmd?: string;
  args?: Record<string, unknown>;
}

const RECONNECT_DELAY_MS = 3000;

export class Bridge {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url = '';

  constructor(
    private np2: WebNP2,
    private canvas: HTMLCanvasElement,
  ) {}

  connect(url: string): void {
    this.url = url;
    this.clearReconnectTimer();
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try {
        old.close();
      } catch {
        // 既に閉じている場合は無視。
      }
    }
    this.open();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, RECONNECT_DELAY_MS);
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.clearReconnectTimer();
      ws.send(JSON.stringify({ type: 'hello', role: 'webnp2' }));
    });

    ws.addEventListener('close', () => {
      if (this.ws === ws) {
        this.ws = null;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      this.scheduleReconnect();
    });

    ws.addEventListener('message', (ev: MessageEvent) => {
      void this.handleMessage(ws, ev);
    });
  }

  private async handleMessage(ws: WebSocket, ev: MessageEvent): Promise<void> {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(String(ev.data));
    } catch (err) {
      console.error('[WebNP2 bridge] invalid message', err);
      return;
    }
    const { id, cmd, args } = msg;
    try {
      const result = await this.dispatch(cmd, args ?? {});
      ws.send(JSON.stringify({ id, ok: true, result }));
    } catch (err) {
      ws.send(JSON.stringify({ id, ok: false, error: String(err) }));
    }
  }

  private async dispatch(cmd: string | undefined, args: Record<string, unknown>): Promise<unknown> {
    switch (cmd) {
      case 'ping':
        return { pong: true };
      case 'screen_text':
        return this.np2.getScreenText();
      case 'type_text':
        await this.np2.typeText(String(args.text ?? ''));
        return { done: true };
      case 'paste_text':
        return await this.np2.pasteText(String(args.text ?? ''));
      case 'wait_screen':
        return await this.np2.waitScreenText(
          String(args.contains ?? ''),
          args.timeout_ms !== undefined ? Number(args.timeout_ms) : undefined,
        );
      case 'setup_paste_helper':
        return await this.np2.setupPasteHelper({
          drive: args.drive !== undefined ? (Number(args.drive) as 1 | 2) : undefined,
          command: args.command !== undefined ? String(args.command) : undefined,
        });
      case 'send_keys':
        await this.np2.sendKeys(String(args.keys ?? ''));
        return { done: true };
      case 'key_sequence':
        return await this.np2.runKeySequence((args.steps as KeyStep[]) ?? []);
      case 'key':
        this.np2.sendKey(Number(args.code), Boolean(args.down));
        return { done: true };
      case 'reset':
        this.np2.resetMachine();
        return { done: true };
      case 'screenshot':
        return { dataUrl: this.canvas.toDataURL('image/png') };
      default:
        throw new Error(`unknown command: ${String(cmd)}`);
    }
  }
}
