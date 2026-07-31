#!/usr/bin/env node
// WebNP2 MCP server: bridges MCP tool calls to a WebNP2 (PC-98 emulator) browser tab
// over a WebSocket connection, so an MCP client (e.g. Claude Code) can read the
// emulator screen and send keyboard input.
//
// IMPORTANT: stdout is reserved for the MCP stdio transport. Never use
// console.log() here -- always use console.error() for diagnostic output.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const BRIDGE_PORT = Number(process.env.WEBNP2_BRIDGE_PORT) || 3098;
const REQUEST_TIMEOUT_MS = 15000;

// --- WebSocket bridge -------------------------------------------------

/** @type {import('ws').WebSocket | null} */
let activeClient = null;
let nextRequestId = 1;
/** @type {Map<number, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
const pending = new Map();

const wss = new WebSocketServer({ port: BRIDGE_PORT });

wss.on('listening', () => {
  console.error(`WebSocket bridge listening on port ${BRIDGE_PORT}`);
});

wss.on('error', (err) => {
  console.error('WebSocket server error:', err && err.stack ? err.stack : err);
});

wss.on('connection', (ws) => {
  console.error('Browser client connected');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      console.error('Received non-JSON message from browser:', err.message);
      return;
    }

    if (msg && msg.type === 'hello' && msg.role === 'webnp2') {
      // A new browser tab has announced itself. It becomes the active client;
      // any previously active client is closed.
      if (activeClient && activeClient !== ws && activeClient.readyState === activeClient.OPEN) {
        console.error('Replacing previous active client');
        try {
          activeClient.close();
        } catch {
          // ignore
        }
      }
      activeClient = ws;
      console.error('Active WebNP2 client registered');
      return;
    }

    if (msg && typeof msg.id === 'number') {
      const entry = pending.get(msg.id);
      if (!entry) {
        // Unknown or already-timed-out request id; ignore.
        return;
      }
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) {
        entry.resolve(msg.result);
      } else {
        entry.reject(new Error(msg.error || 'Unknown error from browser'));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (activeClient === ws) {
      activeClient = null;
      console.error('Active WebNP2 client disconnected');
    }
  });

  ws.on('error', (err) => {
    console.error('Browser socket error:', err && err.stack ? err.stack : err);
  });
});

/**
 * Sends a command to the connected browser and waits for its response.
 * @param {string} cmd
 * @param {object} [args]
 * @returns {Promise<any>}
 */
function sendCommand(cmd, args = {}) {
  if (!activeClient || activeClient.readyState !== activeClient.OPEN) {
    return Promise.reject(new Error('BRIDGE_DISCONNECTED'));
  }

  const id = nextRequestId++;
  const payload = JSON.stringify({ id, cmd, args });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for browser response to '${cmd}'`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });

    try {
      activeClient.send(payload);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

const NOT_CONNECTED_MESSAGE =
  'ブラウザが未接続です。?bridge=1 付きでWebNP2を開いてください (例: http://localhost:5173/?freedos=1&run=1&bridge=1)';

/**
 * Wraps a tool handler so that a disconnected bridge produces a clean
 * isError tool result instead of throwing.
 * @param {() => Promise<{content: any[]}>} fn
 */
async function withBridge(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err && err.message === 'BRIDGE_DISCONNECTED') {
      return {
        isError: true,
        content: [{ type: 'text', text: NOT_CONNECTED_MESSAGE }],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${err && err.message ? err.message : String(err)}` }],
    };
  }
}

// --- MCP server ---------------------------------------------------------

const server = new McpServer({
  name: 'webnp2-mcp',
  version: '0.1.0',
});

server.tool(
  'screen_text',
  'Read the current text-mode screen contents (80x25) of the WebNP2 PC-98 emulator, along with the text cursor position if visible. Use this to see what is currently displayed in the emulator.',
  {},
  async () =>
    withBridge(async () => {
      const result = await sendCommand('screen_text');
      const text = result && typeof result.text === 'string' ? result.text : '';
      const cursor = result && result.cursor;
      const cursorLine =
        cursor && typeof cursor.row === 'number' && typeof cursor.col === 'number'
          ? `Cursor: row=${cursor.row}, col=${cursor.col}`
          : 'Cursor: none';
      return {
        content: [{ type: 'text', text: `${text}\n${cursorLine}` }],
      };
    })
);

server.tool(
  'type_text',
  'Type a string of text into the WebNP2 PC-98 emulator, as if typed on the keyboard. Only ASCII characters and newlines are supported. After typing, the resulting screen text is returned for convenience.',
  {
    text: z.string().describe('The ASCII text to type. Newlines are sent as Enter key presses.'),
  },
  async ({ text }) =>
    withBridge(async () => {
      await sendCommand('type_text', { text });

      let followUpText = 'Typed text successfully.';
      try {
        const result = await sendCommand('screen_text');
        const screenText = result && typeof result.text === 'string' ? result.text : '';
        const cursor = result && result.cursor;
        const cursorLine =
          cursor && typeof cursor.row === 'number' && typeof cursor.col === 'number'
            ? `Cursor: row=${cursor.row}, col=${cursor.col}`
            : 'Cursor: none';
        followUpText = `${screenText}\n${cursorLine}`;
      } catch {
        // Ignore screen_text failures after a successful type_text.
      }

      return {
        content: [{ type: 'text', text: followUpText }],
      };
    })
);

server.tool(
  'paste_text',
  'Paste text into the PC-98 emulator. Unlike type_text, this supports full-width Japanese (Shift_JIS) characters. Newlines are sent as Enter. After pasting, the resulting screen text is returned for convenience. ' +
    'If a resident paste-helper TSR is active (after calling setup_paste_helper), full-width text works even under NEC MS-DOS. ' +
    'Without the TSR, full-width characters only reach DBCS-aware input targets such as FreeDOS(98); NEC MS-DOS CON discards them (ASCII/half-width kana still work).',
  {
    text: z.string().describe('The text to paste, including full-width Japanese characters. Newlines are sent as Enter key presses.'),
  },
  async ({ text }) =>
    withBridge(async () => {
      const result = await sendCommand('paste_text', { text });
      const sent = result && typeof result.sent === 'number' ? result.sent : 0;
      const skipped = (result && Array.isArray(result.skipped)) ? result.skipped : [];

      let followUpText = `Pasted ${sent} byte(s).${skipped.length > 0 ? ` Skipped unsupported characters: ${skipped.join(', ')}` : ''}`;
      try {
        const screenResult = await sendCommand('screen_text');
        const screenText = screenResult && typeof screenResult.text === 'string' ? screenResult.text : '';
        const cursor = screenResult && screenResult.cursor;
        const cursorLine =
          cursor && typeof cursor.row === 'number' && typeof cursor.col === 'number'
            ? `Cursor: row=${cursor.row}, col=${cursor.col}`
            : 'Cursor: none';
        followUpText = `${followUpText}\n${screenText}\n${cursorLine}`;
      } catch {
        // Ignore screen_text failures after a successful paste_text.
      }

      return {
        content: [{ type: 'text', text: followUpText }],
      };
    })
);

server.tool(
  'send_keys',
  'Send a single key combination to the WebNP2 PC-98 emulator, such as "ENTER", "CTRL+C", or "F1".',
  {
    keys: z.string().describe('A single key combination, e.g. "ENTER", "CTRL+C", "F1".'),
  },
  async ({ keys }) =>
    withBridge(async () => {
      await sendCommand('send_keys', { keys });
      return {
        content: [{ type: 'text', text: `Sent keys: ${keys}` }],
      };
    })
);

server.tool(
  'key_sequence',
  'Run a keyboard macro: a sequence of key steps executed in order against the WebNP2 PC-98 emulator. ' +
    'Use this for scripted operation sequences (e.g. "press ESC to quit the FD filer, wait, then type a command") ' +
    'and for key long-presses / held-key gestures (e.g. holding RIGHT for 2 seconds to move a character). ' +
    'Each step object has a "type": ' +
    '"press" (tap keys and release; optional holdMs, default ~30ms, for long-presses), ' +
    '"down" (press keys and hold, without releasing), ' +
    '"up" (release keys previously held down), ' +
    '"wait" (pause for ms milliseconds, clamped to 10000ms per step), ' +
    '"text" (type ASCII text like type_text), ' +
    '"paste" (paste text including full-width Japanese, like paste_text). ' +
    '"press"/"down"/"up" take a "keys" string in the same "+"-joined combo format as send_keys, e.g. "CTRL+C" or "RIGHT". ' +
    'Example: [{"type":"press","keys":"ESC"},{"type":"wait","ms":500},{"type":"text","text":"dir\\n"}]. ' +
    'Long-press example: {"type":"press","keys":"RIGHT","holdMs":2000}. ' +
    'Hold-then-release example: [{"type":"down","keys":"RIGHT"},{"type":"wait","ms":1000},{"type":"up","keys":"RIGHT"}]. ' +
    'Total sequence wait time is capped at 60 seconds; keys left held on error are automatically released. ' +
    'Available named keys: ESC, ENTER (CR/RETURN), SPACE, UP, DOWN, LEFT, RIGHT, F1-F10, CTRL, SHIFT, GRPH, XFER, NFER, STOP, COPY, HOME (CLR), HELP, INS, DEL, ROLLUP, ROLLDOWN, TAB, BS, KANA, CAPS, plus single ASCII characters.',
  {
    steps: z
      .array(
        z.object({
          type: z.enum(['press', 'down', 'up', 'wait', 'text', 'paste']).describe(
            'Step kind. "press"/"down"/"up" require "keys". "wait" requires "ms". "text"/"paste" require "text". "press" may also take "holdMs".'
          ),
          keys: z.string().optional().describe('Key combo for press/down/up, e.g. "ENTER", "CTRL+C", "RIGHT".'),
          holdMs: z.number().optional().describe('For "press" only: how long to hold the key before releasing, in ms (default ~30ms).'),
          ms: z.number().optional().describe('For "wait" only: how long to pause, in ms (max 10000 per step).'),
          text: z.string().optional().describe('For "text"/"paste" only: the text to send.'),
        })
      )
      .min(1)
      .max(64)
      .describe('The ordered list of key steps to execute (1-64 steps).'),
  },
  async ({ steps }) =>
    withBridge(async () => {
      const result = await sendCommand('key_sequence', { steps });
      const executed = result && typeof result.executed === 'number' ? result.executed : steps.length;

      let followUpText = `Executed ${executed} key sequence step(s).`;
      try {
        const screenResult = await sendCommand('screen_text');
        const screenText = screenResult && typeof screenResult.text === 'string' ? screenResult.text : '';
        const cursor = screenResult && screenResult.cursor;
        const cursorLine =
          cursor && typeof cursor.row === 'number' && typeof cursor.col === 'number'
            ? `Cursor: row=${cursor.row}, col=${cursor.col}`
            : 'Cursor: none';
        followUpText = `${followUpText}\n${screenText}\n${cursorLine}`;
      } catch {
        // Ignore screen_text failures after a successful key_sequence.
      }

      return {
        content: [{ type: 'text', text: followUpText }],
      };
    })
);

server.tool(
  'key_code',
  'Inject a low-level PC-98 keyboard scan code into the WebNP2 emulator, for precise key-down/key-up control.',
  {
    code: z.number().describe('The scan code to inject.'),
    down: z.boolean().describe('True for key-down, false for key-up.'),
  },
  async ({ code, down }) =>
    withBridge(async () => {
      await sendCommand('key', { code, down });
      return {
        content: [{ type: 'text', text: `Sent key code ${code} (${down ? 'down' : 'up'})` }],
      };
    })
);

server.tool(
  'reset',
  'Reset (reboot) the WebNP2 PC-98 emulated machine.',
  {},
  async () =>
    withBridge(async () => {
      await sendCommand('reset');
      return {
        content: [{ type: 'text', text: 'Machine reset.' }],
      };
    })
);

server.tool(
  'screenshot',
  'Capture a screenshot of the WebNP2 PC-98 emulator display as a PNG image.',
  {},
  async () =>
    withBridge(async () => {
      const result = await sendCommand('screenshot');
      const dataUrl = typeof result === 'string' ? result : result && result.dataUrl;
      if (typeof dataUrl !== 'string') {
        throw new Error('Unexpected screenshot result from browser');
      }
      const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
      const base64Data = match ? match[1] : dataUrl;
      return {
        content: [{ type: 'image', data: base64Data, mimeType: 'image/png' }],
      };
    })
);

server.tool(
  'wait_screen',
  'Poll the WebNP2 PC-98 emulator screen until it contains the given text, or until timeout. ' +
    'Use this instead of a fixed sleep/wait before checking screen state after an operation whose completion time is unpredictable ' +
    '(booting, disk access, TSR installation, etc). Returns whether the text was found and the last screen text read.',
  {
    contains: z.string().describe('Substring to wait for in the screen text.'),
    timeout_ms: z.number().optional().describe('Max time to wait, in ms (default 10000, max 60000).'),
  },
  async ({ contains, timeout_ms }) =>
    withBridge(async () => {
      const result = await sendCommand('wait_screen', { contains, timeout_ms });
      const found = result && result.found === true;
      const text = result && typeof result.text === 'string' ? result.text : '';
      return {
        content: [{ type: 'text', text: `${found ? 'Found' : 'Timed out waiting for'} "${contains}".\n${text}` }],
      };
    })
);

server.tool(
  'setup_paste_helper',
  'Set up a resident paste-helper TSR in the guest OS by inserting a tools floppy (containing PASTE.COM) and running it. ' +
    'After this succeeds, paste_text becomes able to deliver full-width Japanese text even under NEC MS-DOS ' +
    '(normally full-width paste only works with DBCS-aware inputs like FreeDOS(98)). ' +
    'Call this once early in a session before relying on full-width paste_text on NEC MS-DOS.',
  {
    drive: z.number().optional().describe('Floppy drive number to insert the tools disk into (1 or 2, default 1).'),
    command: z.string().optional().describe('Command line to run the TSR (default "b:paste").'),
  },
  async ({ drive, command }) =>
    withBridge(async () => {
      const result = await sendCommand('setup_paste_helper', { drive, command });
      const ok = result && result.ok === true;
      const message = result && typeof result.message === 'string' ? result.message : '';
      let followUpText = `${ok ? 'OK' : 'Failed'}: ${message}`;
      try {
        const screenResult = await sendCommand('screen_text');
        const screenText = screenResult && typeof screenResult.text === 'string' ? screenResult.text : '';
        followUpText = `${followUpText}\n${screenText}`;
      } catch {
        // Ignore screen_text failures after setup_paste_helper.
      }
      return {
        content: [{ type: 'text', text: followUpText }],
      };
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('WebNP2 MCP server connected via stdio');
