// WebSocketブリッジ: 外部ツール(自動操作・テスト等)からWebNP2を遠隔操作するための最小プロトコル。
// メッセージ形式は {id, cmd, args} を受け取り、{id, ok, result} または {id, ok:false, error} を返す。

import { encodeTextForDisk, base64ToBytes, bytesToBase64, type DiskSlot, type KeyStep, type WebNP2 } from './webnp2.ts';

interface IncomingMessage {
  id?: unknown;
  cmd?: string;
  args?: Record<string, unknown>;
}

const RECONNECT_DELAY_MS = 3000;

/** slot引数を'fd1'|'fd2'へ検証する。それ以外(hdd等)はError。 */
function toFdSlot(value: unknown): 'fd1' | 'fd2' {
  if (value === 'fd1' || value === 'fd2') return value;
  throw new Error(`invalid slot (fd1/fd2のみ対応): ${String(value)}`);
}

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

  /** WebSocket経由でなくページ内JS(window.np2debug等)から直接コマンドを実行するための入口。 */
  async exec(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.dispatch(cmd, args);
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
      case 'save_state':
        await this.np2.saveStateSlot(String(args.slot ?? 'default'));
        return { done: true };
      case 'load_state':
        await this.np2.loadStateSlot(String(args.slot ?? 'default'));
        return { done: true };
      case 'list_states':
        return await this.np2.listStateSlots();
      case 'wait_screen_change':
        return await this.np2.waitScreenChange({
          stableMs: args.stable_ms !== undefined ? Number(args.stable_ms) : undefined,
          timeoutMs: args.timeout_ms !== undefined ? Number(args.timeout_ms) : undefined,
        });
      case 'mouse_move':
        return await this.np2.mouseMoveTo(Number(args.x), Number(args.y));
      case 'mouse_click':
        await this.np2.mouseClick({
          x: args.x !== undefined ? Number(args.x) : undefined,
          y: args.y !== undefined ? Number(args.y) : undefined,
          button: args.button === 'right' ? 'right' : args.button === 'left' ? 'left' : undefined,
          count: args.count !== undefined ? Number(args.count) : undefined,
        });
        return { done: true };
      case 'mouse_drag':
        await this.np2.mouseDrag(
          args.from as { x: number; y: number },
          args.to as { x: number; y: number },
          args.button === 'right' ? 'right' : args.button === 'left' ? 'left' : undefined,
        );
        return { done: true };
      case 'mouse_home':
        await this.np2.mouseHome();
        return { done: true };
      case 'find_text':
        return this.np2.findScreenText(String(args.text ?? ''), { all: Boolean(args.all) });
      case 'click_text':
        return await this.np2.clickScreenText(String(args.text ?? ''), {
          button: args.button === 'right' ? 'right' : args.button === 'left' ? 'left' : undefined,
          occurrence: args.occurrence !== undefined ? Number(args.occurrence) : undefined,
        });
      case 'list_disks':
        return this.np2.listDisks();
      case 'list_disk_library':
        return await this.np2.listDiskLibrary();
      case 'insert_disk': {
        const drive = Number(args.drive) as 1 | 2;
        const specified = [args.url !== undefined, args.source_key !== undefined, args.blank === true].filter(Boolean).length;
        if (specified !== 1) {
          throw new Error('insert_disk: specify exactly one of url, source_key, blank');
        }
        if (args.url !== undefined) {
          return await this.np2.insertFdFromUrl(drive, String(args.url));
        }
        if (args.source_key !== undefined) {
          return await this.np2.insertFdFromLibraryKey(drive, String(args.source_key));
        }
        return await this.np2.insertBlankFd(drive);
      }
      case 'eject_disk':
        await this.np2.ejectFd(Number(args.drive) as 1 | 2);
        return { done: true };
      case 'export_disk':
        return await this.np2.exportDiskBase64(args.slot as DiskSlot);
      case 'persist_disks':
        await this.np2.persistNow({ force: true });
        return { done: true };
      case 'disk_list_files': {
        const slot = toFdSlot(args.slot);
        const path = args.path !== undefined ? String(args.path) : '';
        return await this.np2.diskListFiles(slot, path);
      }
      case 'disk_read_file': {
        const slot = toFdSlot(args.slot);
        const path = String(args.path ?? '');
        const bytes = await this.np2.diskReadFile(slot, path);
        if (args.encoding === 'base64') {
          return { base64: bytesToBase64(bytes), size: bytes.length };
        }
        const decoder = new TextDecoder('shift_jis' as string);
        return { text: decoder.decode(bytes) };
      }
      case 'disk_write_file': {
        const slot = toFdSlot(args.slot);
        const path = String(args.path ?? '');
        let data: Uint8Array;
        let skipped: string[] = [];
        if (args.base64 !== undefined) {
          data = base64ToBytes(String(args.base64));
        } else if (args.content !== undefined) {
          const encoded = encodeTextForDisk(String(args.content));
          data = encoded.bytes;
          skipped = encoded.skipped;
        } else {
          throw new Error('disk_write_file: specify content or base64');
        }
        await this.np2.diskWriteFile(slot, path, data);
        return { done: true, size: data.length, skipped };
      }
      case 'disk_delete_file': {
        const slot = toFdSlot(args.slot);
        const path = String(args.path ?? '');
        await this.np2.diskDeleteFile(slot, path);
        return { done: true };
      }
      case 'put_file': {
        const path = String(args.path ?? '');
        const drive = args.drive !== undefined ? (Number(args.drive) as 1 | 2) : undefined;
        const timeoutMs = args.timeout_ms !== undefined ? Number(args.timeout_ms) : undefined;
        if (args.base64 !== undefined) {
          return await this.np2.putFileToGuest({ path, bytes: base64ToBytes(String(args.base64)), drive, timeoutMs });
        }
        return await this.np2.putFileToGuest({ path, content: String(args.content ?? ''), drive, timeoutMs });
      }
      case 'read_memory': {
        const addr = Number(args.addr);
        const len = Number(args.len);
        const MAX_LEN = 1024 * 1024;
        if (!Number.isFinite(addr) || addr < 0) {
          throw new Error('read_memory: addr must be >= 0');
        }
        if (!Number.isFinite(len) || len < 0 || len > MAX_LEN) {
          throw new Error(`read_memory: len must be within 0..${MAX_LEN}`);
        }
        return this.np2.readMemoryBase64(addr, len);
      }
      case 'get_file': {
        const path = String(args.path ?? '');
        const drive = args.drive !== undefined ? (Number(args.drive) as 1 | 2) : undefined;
        const encoding = args.encoding === 'base64' ? 'base64' : 'text';
        const timeoutMs = args.timeout_ms !== undefined ? Number(args.timeout_ms) : undefined;
        return await this.np2.getFileFromGuest({ path, drive, encoding, timeoutMs });
      }
      default:
        throw new Error(`unknown command: ${String(cmd)}`);
    }
  }
}
