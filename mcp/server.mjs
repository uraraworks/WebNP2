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

server.tool(
  'save_state',
  'Save a snapshot of the current WebNP2 emulator execution state (CPU/memory/devices) into a named slot. ' +
    'Save one before trying something risky or experimental, so you can roll back with load_state if it goes wrong.',
  {
    slot: z.string().optional().describe('Slot name to save into (alnum/underscore/hyphen, max 32 chars, default "default").'),
  },
  async ({ slot }) =>
    withBridge(async () => {
      await sendCommand('save_state', { slot });
      return {
        content: [{ type: 'text', text: `Saved state to slot "${slot ?? 'default'}".` }],
      };
    })
);

server.tool(
  'load_state',
  'Restore the WebNP2 emulator execution state previously saved with save_state into the given slot, rolling back CPU/memory/devices. ' +
    'Fails if no state was ever saved to that slot.',
  {
    slot: z.string().optional().describe('Slot name to load from (default "default").'),
  },
  async ({ slot }) =>
    withBridge(async () => {
      await sendCommand('load_state', { slot });
      let followUpText = `Loaded state from slot "${slot ?? 'default'}".`;
      try {
        const screenResult = await sendCommand('screen_text');
        const screenText = screenResult && typeof screenResult.text === 'string' ? screenResult.text : '';
        followUpText = `${followUpText}\n${screenText}`;
      } catch {
        // Ignore screen_text failures after a successful load_state.
      }
      return {
        content: [{ type: 'text', text: followUpText }],
      };
    })
);

server.tool(
  'list_states',
  'List the named state slots previously saved with save_state, along with when each was saved.',
  {},
  async () =>
    withBridge(async () => {
      const result = await sendCommand('list_states');
      const slots = Array.isArray(result) ? result : [];
      if (slots.length === 0) {
        return { content: [{ type: 'text', text: 'No saved states.' }] };
      }
      const lines = slots.map((s) => `${s.slot}\t${new Date(s.savedAt).toISOString()}`);
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
);

server.tool(
  'wait_screen_change',
  'Poll the WebNP2 PC-98 emulator screen until it changes from its current contents, then wait for it to stabilize (stop changing) before returning. ' +
    'Use this to detect completion of an operation with unpredictable timing (e.g. a load finishing or a command completing) when you do not know the exact text that will appear. ' +
    'If you do know the expected text, wait_screen is more reliable.',
  {
    stable_ms: z.number().optional().describe('How long the screen must stay unchanged after the first change to be considered stable, in ms (default 800, max 5000).'),
    timeout_ms: z.number().optional().describe('Max total time to wait, in ms (default 15000, max 60000).'),
  },
  async ({ stable_ms, timeout_ms }) =>
    withBridge(async () => {
      const result = await sendCommand('wait_screen_change', { stable_ms, timeout_ms });
      const changed = result && result.changed === true;
      const text = result && typeof result.text === 'string' ? result.text : '';
      return {
        content: [{ type: 'text', text: `${changed ? 'Screen changed and stabilized.' : 'Timed out; screen never changed.'}\n${text}` }],
      };
    })
);

async function withScreenText(followUpText) {
  try {
    const screenResult = await sendCommand('screen_text');
    const screenText = screenResult && typeof screenResult.text === 'string' ? screenResult.text : '';
    const cursor = screenResult && screenResult.cursor;
    const cursorLine =
      cursor && typeof cursor.row === 'number' && typeof cursor.col === 'number'
        ? `Cursor: row=${cursor.row}, col=${cursor.col}`
        : 'Cursor: none';
    return `${followUpText}\n${screenText}\n${cursorLine}`;
  } catch {
    return followUpText;
  }
}

server.tool(
  'mouse_move',
  'Move the WebNP2 PC-98 emulator mouse pointer to screen coordinates (0-639, 0-399). ' +
    'The PC-98 bus mouse only reports relative movement, so the guest OS keeps the real cursor position; ' +
    'on first use this automatically "homes" the pointer by moving it far off-screen into the top-left corner to establish a known baseline. ' +
    'Because of this, the position tracked here is a host-side estimate -- if it drifts (e.g. the guest OS itself warped the cursor), call mouse_home to re-establish the baseline.',
  {
    x: z.number().describe('Target X coordinate, 0-639 (clamped).'),
    y: z.number().describe('Target Y coordinate, 0-399 (clamped).'),
  },
  async ({ x, y }) =>
    withBridge(async () => {
      const result = await sendCommand('mouse_move', { x, y });
      const pos = result && typeof result.x === 'number' ? `(${result.x}, ${result.y})` : `(${x}, ${y})`;
      const text = await withScreenText(`Moved mouse to ${pos}.`);
      return { content: [{ type: 'text', text }] };
    })
);

server.tool(
  'mouse_click',
  'Click the WebNP2 PC-98 emulator mouse at the given coordinates (or at the current pointer position if x/y are omitted). ' +
    'button defaults to "left"; count defaults to 1 (use 2 for double-click, up to 3).',
  {
    x: z.number().optional().describe('X coordinate to move to before clicking, 0-639.'),
    y: z.number().optional().describe('Y coordinate to move to before clicking, 0-399.'),
    button: z.enum(['left', 'right']).optional().describe('Mouse button to click (default "left").'),
    count: z.number().optional().describe('Number of clicks, 1-3 (default 1).'),
  },
  async ({ x, y, button, count }) =>
    withBridge(async () => {
      await sendCommand('mouse_click', { x, y, button, count });
      const text = await withScreenText('Clicked mouse.');
      return { content: [{ type: 'text', text }] };
    })
);

server.tool(
  'mouse_drag',
  'Drag the WebNP2 PC-98 emulator mouse from one point to another (move to start, press button, move to end, release). button defaults to "left".',
  {
    from_x: z.number().describe('Start X coordinate, 0-639.'),
    from_y: z.number().describe('Start Y coordinate, 0-399.'),
    to_x: z.number().describe('End X coordinate, 0-639.'),
    to_y: z.number().describe('End Y coordinate, 0-399.'),
    button: z.enum(['left', 'right']).optional().describe('Mouse button to hold during the drag (default "left").'),
  },
  async ({ from_x, from_y, to_x, to_y, button }) =>
    withBridge(async () => {
      await sendCommand('mouse_drag', { from: { x: from_x, y: from_y }, to: { x: to_x, y: to_y }, button });
      const text = await withScreenText(`Dragged mouse from (${from_x}, ${from_y}) to (${to_x}, ${to_y}).`);
      return { content: [{ type: 'text', text }] };
    })
);

server.tool(
  'mouse_home',
  'Re-home the WebNP2 PC-98 emulator mouse pointer by moving it far off-screen into the top-left corner, re-establishing the host-side coordinate baseline. ' +
    'Use this if mouse_move/mouse_click coordinates seem to have drifted from what is actually shown on screen.',
  {},
  async () =>
    withBridge(async () => {
      await sendCommand('mouse_home');
      const text = await withScreenText('Mouse homed to top-left.');
      return { content: [{ type: 'text', text }] };
    })
);

server.tool(
  'find_text',
  'Search the current WebNP2 PC-98 emulator text screen for a substring and return its row/column position(s). ' +
    'Only works on text-mode content (e.g. menu items); has no effect on text drawn as graphics.',
  {
    text: z.string().describe('Substring to search for (case-sensitive).'),
    all: z.boolean().optional().describe('If true, return all matches instead of just the first (default false).'),
  },
  async ({ text, all }) =>
    withBridge(async () => {
      const result = await sendCommand('find_text', { text, all });
      const matches = Array.isArray(result) ? result : [];
      if (matches.length === 0) {
        return { content: [{ type: 'text', text: `No match found for "${text}".` }] };
      }
      const lines = matches.map((m) => `row=${m.row} col=${m.col}: ${m.text}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    })
);

server.tool(
  'click_text',
  'Find a substring on the WebNP2 PC-98 emulator text screen and click on it. ' +
    'Convenient for clicking menu items in text-mode UIs; has no effect on text drawn as graphics.',
  {
    text: z.string().describe('Substring to find and click (case-sensitive).'),
    button: z.enum(['left', 'right']).optional().describe('Mouse button to click (default "left").'),
    occurrence: z.number().optional().describe('Which match to click if the text appears multiple times, 0-based (default 0 = first).'),
  },
  async ({ text, button, occurrence }) =>
    withBridge(async () => {
      const result = await sendCommand('click_text', { text, button, occurrence });
      const found = result && result.found === true;
      const followUp = found
        ? `Clicked "${text}" at (${result.x}, ${result.y}).`
        : `Text "${text}" not found on screen; nothing clicked.`;
      const finalText = await withScreenText(followUp);
      return { content: [{ type: 'text', text: finalText }] };
    })
);

server.tool(
  'list_disks',
  'List disks currently mounted in the WebNP2 PC-98 emulator (hdd/fd1/fd2), with their names and source keys.',
  {},
  async () =>
    withBridge(async () => {
      const result = await sendCommand('list_disks');
      const disks = Array.isArray(result) ? result : [];
      if (disks.length === 0) {
        return { content: [{ type: 'text', text: 'No disks currently mounted.' }] };
      }
      const lines = disks.map((d) => `${d.slot}\t${d.name}\t${d.sourceKey}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    })
);

server.tool(
  'list_disk_library',
  'List disk images previously saved in the browser (IndexedDB) for this WebNP2 instance, with their source key, name, size, kind (hdd/fd), and when they were saved. Use the source_key values with insert_disk.',
  {},
  async () =>
    withBridge(async () => {
      const result = await sendCommand('list_disk_library');
      const entries = Array.isArray(result) ? result : [];
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: 'No saved disk images in the library.' }] };
      }
      const lines = entries.map((e) => `${e.kind}\t${e.name}\t${e.size} bytes\t${new Date(e.savedAt).toISOString()}\t${e.sourceKey}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    })
);

server.tool(
  'insert_disk',
  'Insert a floppy disk image into FD1 or FD2 of the WebNP2 PC-98 emulator. Specify exactly one source: ' +
    '"url" fetches the image from a location reachable from the browser (the server must allow CORS); ' +
    '"source_key" loads a previously saved image from list_disk_library; ' +
    '"blank" (true) inserts a freshly created, unformatted floppy image (DOS FORMAT is required before use).',
  {
    drive: z.number().describe('Floppy drive number to insert into (1 or 2).'),
    url: z.string().optional().describe('URL to fetch the disk image from (requires CORS).'),
    source_key: z.string().optional().describe('sourceKey of a saved image from list_disk_library.'),
    blank: z.boolean().optional().describe('If true, insert a new unformatted blank floppy image.'),
  },
  async ({ drive, url, source_key, blank }) =>
    withBridge(async () => {
      const result = await sendCommand('insert_disk', { drive, url, source_key, blank });
      const name = result && typeof result.name === 'string' ? result.name : '(unknown)';
      let followUpText = `Inserted "${name}" into drive ${drive}.`;
      try {
        const disks = await sendCommand('list_disks');
        if (Array.isArray(disks)) {
          followUpText += `\n${disks.map((d) => `${d.slot}\t${d.name}\t${d.sourceKey}`).join('\n')}`;
        }
      } catch {
        // Ignore list_disks failures after a successful insert_disk.
      }
      return { content: [{ type: 'text', text: followUpText }] };
    })
);

server.tool(
  'eject_disk',
  'Eject the floppy disk currently in FD1 or FD2 of the WebNP2 PC-98 emulator. The image is automatically saved to the browser library before ejecting.',
  {
    drive: z.number().describe('Floppy drive number to eject (1 or 2).'),
  },
  async ({ drive }) =>
    withBridge(async () => {
      await sendCommand('eject_disk', { drive });
      let followUpText = `Ejected drive ${drive}.`;
      try {
        const disks = await sendCommand('list_disks');
        if (Array.isArray(disks)) {
          followUpText += `\n${disks.map((d) => `${d.slot}\t${d.name}\t${d.sourceKey}`).join('\n')}`;
        }
      } catch {
        // Ignore list_disks failures after a successful eject_disk.
      }
      return { content: [{ type: 'text', text: followUpText }] };
    })
);

server.tool(
  'export_disk',
  'Get the raw bytes of the disk image currently mounted in the given slot, base64-encoded. ' +
    'Fails with an error if the image is larger than 5MB (e.g. a typical HDD image) -- for large images, use the UI download button instead.',
  {
    slot: z.enum(['hdd', 'fd1', 'fd2']).describe('Which mounted slot to export.'),
  },
  async ({ slot }) =>
    withBridge(async () => {
      const result = await sendCommand('export_disk', { slot });
      const name = result && typeof result.name === 'string' ? result.name : '(unknown)';
      const size = result && typeof result.size === 'number' ? result.size : 0;
      const base64 = result && typeof result.base64 === 'string' ? result.base64 : '';
      return {
        content: [{ type: 'text', text: `name=${name} size=${size} bytes\n${base64}` }],
      };
    })
);

server.tool(
  'persist_disks',
  'Immediately save any changes to currently mounted disk images into the browser IndexedDB library, without waiting for the periodic auto-save or an eject.',
  {},
  async () =>
    withBridge(async () => {
      await sendCommand('persist_disks');
      return { content: [{ type: 'text', text: 'Persisted mounted disk images.' }] };
    })
);

server.tool(
  'disk_list_files',
  'List files inside the disk image mounted in a WebNP2 floppy drive (FD1/FD2), by reading its FAT12/16 filesystem directly (no guest OS interaction). ' +
    'Only FAT12/16 floppy (2HD/2DD) images are supported; HDD slots are not, because the emulator core cannot swap a HDD while running. ' +
    'HDD images can be edited before boot from the file transfer dialog in the WebNP2 UI, but not through this tool. ' +
    'Filenames are 8.3 format only (no long filenames). ' +
    'Also returns free/total space on the volume.',
  {
    slot: z.enum(['fd1', 'fd2']).describe('Which floppy drive slot to read.'),
    path: z.string().optional().describe('Directory path inside the disk to list (e.g. "SUBDIR"). Omit or "" for the root directory.'),
  },
  async ({ slot, path }) =>
    withBridge(async () => {
      const result = await sendCommand('disk_list_files', { slot, path });
      const entries = (result && Array.isArray(result.entries)) ? result.entries : [];
      const free = result && typeof result.free === 'number' ? result.free : 0;
      const total = result && typeof result.total === 'number' ? result.total : 0;
      const lines = entries.map((e) => `${e.isDir ? '<DIR>' : String(e.size).padStart(8)}  ${e.name}  ${new Date(e.mtime).toISOString()}`);
      lines.push(`-- free ${free} / total ${total} bytes --`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    })
);

server.tool(
  'disk_read_file',
  'Read a file from inside the disk image mounted in a WebNP2 floppy drive (FD1/FD2), by parsing its FAT12/16 filesystem directly (no guest OS interaction). ' +
    'Only FAT12/16 floppy images are supported; HDD slots are not, because the emulator core cannot swap a HDD while running ' +
    '(HDD images can be edited before boot from the file transfer dialog in the WebNP2 UI). Filenames are 8.3 format only. ' +
    'Text mode (default) decodes the file bytes as Shift_JIS. For binary files, use base64 mode instead.',
  {
    slot: z.enum(['fd1', 'fd2']).describe('Which floppy drive slot to read from.'),
    path: z.string().describe('File path inside the disk, e.g. "TEST.TXT" or "SUBDIR/TEST.TXT".'),
    encoding: z.enum(['text', 'base64']).optional().describe('"text" (default) decodes as Shift_JIS; "base64" returns raw bytes base64-encoded (use for binaries).'),
  },
  async ({ slot, path, encoding }) =>
    withBridge(async () => {
      const result = await sendCommand('disk_read_file', { slot, path, encoding });
      if (encoding === 'base64') {
        const base64 = result && typeof result.base64 === 'string' ? result.base64 : '';
        const size = result && typeof result.size === 'number' ? result.size : 0;
        return { content: [{ type: 'text', text: `size=${size} bytes\n${base64}` }] };
      }
      const text = result && typeof result.text === 'string' ? result.text : '';
      return { content: [{ type: 'text', text }] };
    })
);

server.tool(
  'disk_write_file',
  'Write (create or overwrite) a file inside the disk image mounted in a WebNP2 floppy drive (FD1/FD2), by modifying its FAT12/16 filesystem directly (no guest OS interaction). ' +
    'Only FAT12/16 floppy images are supported; HDD slots are not, because the emulator core cannot swap a HDD while running ' +
    '(HDD images can be edited before boot from the file transfer dialog in the WebNP2 UI). Filenames are 8.3 format only. ' +
    'Specify exactly one of "content" (text, encoded as Shift_JIS) or "base64" (raw bytes). ' +
    'IMPORTANT: after writing, this automatically ejects and re-inserts the floppy in the drive to force the guest OS to drop its disk cache and see the new contents. ' +
    'Call this only when the guest is NOT currently reading/writing that drive, to avoid interrupting in-flight guest disk I/O.',
  {
    slot: z.enum(['fd1', 'fd2']).describe('Which floppy drive slot to write to.'),
    path: z.string().describe('File path inside the disk, e.g. "TEST.TXT".'),
    content: z.string().optional().describe('Text content to write, encoded as Shift_JIS (newlines become CRLF). Mutually exclusive with "base64".'),
    base64: z.string().optional().describe('Raw file bytes, base64-encoded. Mutually exclusive with "content".'),
  },
  async ({ slot, path, content, base64 }) =>
    withBridge(async () => {
      const result = await sendCommand('disk_write_file', { slot, path, content, base64 });
      const size = result && typeof result.size === 'number' ? result.size : undefined;
      const skipped = (result && Array.isArray(result.skipped)) ? result.skipped : [];
      let text = `Wrote "${path}" to ${slot}${size !== undefined ? ` (${size} bytes)` : ''}.`;
      if (skipped.length > 0) text += ` Skipped unsupported characters: ${skipped.join(', ')}`;
      return { content: [{ type: 'text', text }] };
    })
);

server.tool(
  'disk_delete_file',
  'Delete a file from inside the disk image mounted in a WebNP2 floppy drive (FD1/FD2), by modifying its FAT12/16 filesystem directly (no guest OS interaction). ' +
    'Only FAT12/16 floppy images are supported; HDD slots are not, because the emulator core cannot swap a HDD while running ' +
    '(HDD images can be edited before boot from the file transfer dialog in the WebNP2 UI). Filenames are 8.3 format only. ' +
    'IMPORTANT: after deleting, this automatically ejects and re-inserts the floppy in the drive to force the guest OS to drop its disk cache. ' +
    'Call this only when the guest is NOT currently reading/writing that drive.',
  {
    slot: z.enum(['fd1', 'fd2']).describe('Which floppy drive slot to delete from.'),
    path: z.string().describe('File path inside the disk to delete, e.g. "TEST.TXT".'),
  },
  async ({ slot, path }) =>
    withBridge(async () => {
      await sendCommand('disk_delete_file', { slot, path });
      return { content: [{ type: 'text', text: `Deleted "${path}" from ${slot}.` }] };
    })
);

server.tool(
  'put_file',
  'Transfer host content (text or binary) into the guest OS running in WebNP2, onto any drive/path the guest can see (e.g. the HDD). ' +
    'Internally this writes the data to a transfer floppy first, then has the guest DOS run COPY from that floppy to the destination -- ' +
    'it never lets the host touch the HDD image bytes directly, so it cannot corrupt the DOS disk cache the way direct HDD edits would. ' +
    '"path" is the destination FULL path as seen by the guest (e.g. "A:\\\\WORK\\\\FOO.TXT"); its filename must be 8.3 format. ' +
    'Specify exactly one of "content" (text, Shift_JIS-encoded, CRLF newlines) or "base64" (raw bytes). ' +
    'Run this only while the emulator is sitting at a DOS command prompt (not mid-program), since it types a COPY command and reads the result off the text screen. ' +
    'This is the SAFE way to write to the HDD WHILE THE EMULATOR IS RUNNING -- never write to a mounted HDD image directly. ' +
    '(Before boot the constraint does not apply: a HDD that has only been set into the slot can be edited straight from the ' +
    'file transfer dialog in the WebNP2 UI, which is simpler than this tool. That path is UI-only and not exposed here.)',
  {
    path: z.string().describe('Destination full path on the guest, e.g. "A:\\\\WORK\\\\FOO.TXT". Filename must be 8.3 format.'),
    content: z.string().optional().describe('Text content to write, Shift_JIS-encoded with CRLF newlines. Mutually exclusive with "base64".'),
    base64: z.string().optional().describe('Raw file bytes, base64-encoded. Mutually exclusive with "content".'),
    drive: z.number().optional().describe('Transfer floppy drive number to use (1 or 2, default 1).'),
    timeout_ms: z.number().optional().describe('How long to wait for the guest COPY to finish before checking the result, in ms (default 1500, max 20000).'),
  },
  async ({ path, content, base64, drive, timeout_ms }) =>
    withBridge(async () => {
      const result = await sendCommand('put_file', { path, content, base64, drive, timeout_ms });
      const ok = result && result.ok === true;
      const message = result && typeof result.message === 'string' ? result.message : '';
      const screen = result && typeof result.screen === 'string' ? result.screen : '';
      return {
        content: [{ type: 'text', text: `${ok ? 'OK' : 'Failed'}: ${message}\n${screen}` }],
      };
    })
);

server.tool(
  'get_file',
  'Retrieve a file from the guest OS running in WebNP2, from any drive/path the guest can see (e.g. the HDD), back to the host. ' +
    'Internally this has the guest DOS COPY the file onto a transfer floppy first, then the host reads that floppy directly -- ' +
    'it never lets the host touch the HDD image bytes directly. "path" is the source full path as seen by the guest, e.g. "A:\\\\WORK\\\\FOO.TXT". ' +
    'Run this only while the emulator is sitting at a DOS command prompt (not mid-program). ' +
    'This is the SAFE way to read from the HDD WHILE THE EMULATOR IS RUNNING -- never read a mounted HDD image directly. ' +
    '(Before boot the constraint does not apply: a HDD that has only been set into the slot can be read straight from the ' +
    'file transfer dialog in the WebNP2 UI. That path is UI-only and not exposed here.)',
  {
    path: z.string().describe('Source full path on the guest, e.g. "A:\\\\WORK\\\\FOO.TXT".'),
    drive: z.number().optional().describe('Transfer floppy drive number to use (1 or 2, default 1).'),
    encoding: z.enum(['text', 'base64']).optional().describe('"text" (default) decodes as Shift_JIS; "base64" returns raw bytes base64-encoded (use for binaries).'),
    timeout_ms: z.number().optional().describe('How long to wait for the guest COPY to finish before checking the result, in ms (default 1500, max 20000).'),
  },
  async ({ path, drive, encoding, timeout_ms }) =>
    withBridge(async () => {
      const result = await sendCommand('get_file', { path, drive, encoding, timeout_ms });
      const ok = result && result.ok === true;
      const message = result && typeof result.message === 'string' ? result.message : '';
      const screen = result && typeof result.screen === 'string' ? result.screen : '';
      if (!ok) {
        return { content: [{ type: 'text', text: `Failed: ${message}\n${screen}` }] };
      }
      if (encoding === 'base64') {
        const base64 = result && typeof result.base64 === 'string' ? result.base64 : '';
        const size = result && typeof result.size === 'number' ? result.size : 0;
        return { content: [{ type: 'text', text: `OK: ${message} (size=${size} bytes)\n${base64}` }] };
      }
      const text = result && typeof result.text === 'string' ? result.text : '';
      return { content: [{ type: 'text', text: `OK: ${message}\n${text}` }] };
    })
);

server.tool(
  'read_memory',
  'Debug/analysis tool: read raw bytes directly out of the PC-98 guest main RAM (0x00000-0x1FFFFF), bypassing the guest OS entirely. ' +
    'Returns the requested range base64-encoded. Intended for inspecting emulator/guest state (e.g. work areas, VRAM-adjacent memory) during debugging, not for normal file transfer -- use get_file/put_file for guest files.',
  {
    addr: z.number().describe('Start linear address in guest main RAM, 0-based (e.g. 0x502 for the keyboard BIOS ring buffer).'),
    len: z.number().describe('Number of bytes to read. Must be within 0..1048576 (1MB) and addr+len must not exceed the RAM size.'),
  },
  async ({ addr, len }) =>
    withBridge(async () => {
      const result = await sendCommand('read_memory', { addr, len });
      const base64 = result && typeof result.base64 === 'string' ? result.base64 : '';
      return { content: [{ type: 'text', text: `addr=${addr} len=${len}\n${base64}` }] };
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('WebNP2 MCP server connected via stdio');
