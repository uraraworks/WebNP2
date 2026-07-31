# WebNP2

[日本語](README.ja.md)

A web-based PC-98 emulator player, powered by [NP2kai](https://github.com/AZO234/NP2kai)
compiled to WebAssembly (NP2kai-wasm). The goal is a "just open the URL and
play" experience — launch, play, and resume — with progress carried across
sessions.

See [docs/DESIGN.md](docs/DESIGN.md) for design details.

## Try it now

- **Live site**: <https://uraraworks.github.io/WebNP2/>
- **FreeDOS(98) auto-boot demo**: <https://uraraworks.github.io/WebNP2/?freedos=1&run=1>
  (boots straight to the DOS prompt with no clicks; audio unmutes on your first click)

No ROMs or commercial software images are bundled. You can load your own
HDD/FD images by dragging and dropping them onto the screen.

## Usage

An introduction page highlighting WebNP2's unique features is available at
<https://uraraworks.github.io/WebNP2/about.html?lang=en>.

A player-facing help page (with screenshots) is available at
<https://uraraworks.github.io/WebNP2/help.html?lang=en>. It can also be opened
from the "Help" button on the player's toolbar.

### URL parameters

```
https://.../?hdd=<HDD image URL>&fd1=<FD1 image URL>&fd2=<FD2 image URL>&run=1&clk=<multiplier>&lang=ja
```

| Parameter | Meaning | Notes |
|---|---|---|
| `hdd` | URL of an HDD image | NP2kai-compatible formats (`.thd`, etc.) |
| `fd1` / `fd2` | URL of a floppy disk image | `.d88`, `.fdi`, etc. |
| `run` | `1` to boot immediately without the start overlay | Due to browser autoplay restrictions the emulator starts muted, showing an "Audio is muted" banner; audio is enabled on your first click or key press |
| `mem` | Extended memory size in MB | Defaults to `1` (640 KB conventional + 1 MB extended — a typical DOS setup). Increase it (e.g. `mem=13`) for software that needs more memory. Clamped to 0–230 |
| `clk` | Clock multiplier | Written to the core cfg as `clk_mult` (integer, clamped to 1–32). Core default when omitted |
| `lang` | UI language (`ja` / `en`) | If omitted, resolved in order: `localStorage['webnp2.lang']` → the browser's `navigator.language` (`ja` if it starts with `ja`) → default `en`. Can be switched at runtime with the language toggle button on the right side of the toolbar; the choice is persisted to `localStorage` and used as the default on subsequent visits |
| `freedos` | `1` to boot the bundled FreeDOS(98) floppy | Mounts `public/freedos/fd98_2hd.xdf` as FD1 (unless `fd1` is also given, which takes priority). Combine with `run=1` to ride the existing auto-start flow |
| `worklet` | `0` to disable low-latency AudioWorklet audio output | Falls back to the legacy SDL (ScriptProcessor) path. Enabled by default; auto-falls back on unsupported browsers too |
| `alat` | Initial low-water mark of the AudioWorklet ring buffer, in ms | Lower is lower-latency but more prone to dropouts. Defaults to one core chunk (~23ms). Raised automatically when dropouts are detected |
| `perf` | `1` shows a performance overlay (FPS / main-thread busy / audio supply) | For diagnosing slowdowns |

If no `hdd`/`fd1`/`fd2`/`freedos` parameters are given, the start overlay offers
two choices: "Start As-Is" (no image loaded — drag and drop an HDD/FD image
onto the screen afterward) or "Start with FreeDOS(98)" (boots the bundled
FreeDOS(98) floppy described below). If any disk is specified via URL
parameters, the overlay instead shows the single traditional "Click to Start"
button.

**Important: any URL passed via `hdd`/`fd1`/`fd2` must be served from an origin
with CORS (`Access-Control-Allow-Origin`) enabled.** Images are fetched with
the browser's `fetch` API, so if the hosting server doesn't send the
appropriate CORS headers, the fetch will fail and an error message will be
shown on screen.

### Drag & drop

Dropping a file onto the screen area auto-detects whether it's an HDD or FD
image based on its extension.

- HDD: `.thd` `.hdi` `.nhd` `.hdd`
- FD: `.d88` `.fdi` `.xdf` `.dup` `.fdd` `.hdm`

Dropping multiple files at once shows a confirmation dialog.

### Keyboard and mouse

- Key input is delivered to the guest as raw scancodes. PC-98 specific keys are
  mapped as XFER = right Alt (right Option) and NFER = left Alt (left Option).
- **Kanji input inside the guest** requires a guest-side FEP (a resident
  kana-kanji conversion program such as ATOK or VJE-β). Your host OS IME has no
  effect on the emulator screen (turn it off while typing). FreeDOS(98) does
  not include a FEP, so use your own MS-DOS + FEP disk images for kanji input.
- **Mouse** support is enabled with the "Capture Mouse" toolbar button (the
  pointer is locked to the screen and emulated as a PC-98 bus mouse; press Esc
  to release). The DOS prompt itself does not use a mouse. Software that reads
  the bus mouse directly works as-is; software using the int 33h API needs a
  guest-side mouse driver (MOUSE.SYS etc.).
- If mouse-driven software feels sluggish, raising the clock multiplier (e.g.
  `?clk=8`) helps. Don't raise it beyond what your machine can emulate in
  real time, though — the emulation starts dropping frames and gets choppy.

### Progress persistence

Once running, each mounted image is checked for changes on a 30-second timer,
when the tab becomes hidden (`visibilitychange`), and when the page is being
unloaded (`pagehide`); changes are automatically saved to IndexedDB (the
`webnp2` database). Opening the same URL again resumes from the saved state.
The "Reset to initial state" button deletes the saved data so the images are
re-fetched from their original URLs.

The "Download disk" button lets you download the current disk image as a
Blob.

### Bundled FreeDOS(98) boot floppy

`public/freedos/fd98_2hd.xdf` is a 2HD boot floppy image of
[FreeDOS(98)](https://github.com/lpproj/fdkernel), a port of FreeDOS (an
MS-DOS-compatible OS) for the PC-9801/9821 series, combining the
FreeDOS(98) kernel ([lpproj/fdkernel](https://github.com/lpproj/fdkernel),
branch `nec98test`, tag `test-20220120-cherrypick`) and FreeCOM DBCS
([lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2)). Both are
free software licensed under **GPLv2 or later**; the image is redistributed
under the same terms with the source available from the repositories above.
See `public/freedos/README.txt` for the full attribution/license text (in
Japanese and English).

It's bundled so visitors can try the emulator without hunting down an OS
image themselves. Three ways to use it:

- Open the player with no `hdd`/`fd1`/`fd2` params and click "Start with
  FreeDOS(98)" on the start overlay.
- Add `?freedos=1` to the URL (optionally with `run=1` for auto-start).
- After boot, click the "Insert FreeDOS(98)" button next to the FDD1 slot,
  then reset the machine to boot it.

The bundled image is persisted to IndexedDB under the fixed key
`freedos:fd98_2hd` regardless of which entry point was used, so edits made
inside FreeDOS(98) (formatting, saving files, etc.) carry over between
visits, and "Reset to initial state" restores the pristine distributed
image.

## MCP server (control WebNP2 from AI agents)

WebNP2 can be driven by AI agents (Claude Code etc.) through a local MCP
server: read the text screen, type keys, take screenshots, and reset the
machine. The MCP server runs on your machine; the page (local or the
public one above) connects back to `ws://127.0.0.1` when opened with the
`?bridge=1` parameter, so nothing is sent to any external server.

Setup instructions live in [mcp/README.md](mcp/README.md). To have your
AI agent set it up for you, just point it at that file and say
"set up MCP access to WebNP2 as described here".

Note: with the public (https) page, use a Chromium-based browser or
Firefox — Safari blocks `ws://` connections from https pages even to
localhost.

## Development

```sh
npm install
npm run dev       # dev server
npm run build     # type-check + production build (dist/)
npm run preview   # preview the production build
```

### Updating the core (public/core/)

`public/core/` holds the build output of
[NP2kai-wasm](https://github.com/AZO234/NP2kai)
(`emnp21kai_sdl2.js` / `.wasm` / `font.bmp` / `LICENSE.NP2kai`). This
directory is tracked in git (build artifacts are committed to the repo by
design).

To refresh the core:

```sh
scripts/update-core.sh
```

By default it copies from `/Users/haruurara/MyProject/_emulator/PC98/NP2kai/build`.
To copy from a different location, set the `NP2KAI_BUILD_DIR` /
`NP2KAI_ROOT_DIR` environment variables.

### Local test files

`public/test/` is a place to keep HDD images etc. for local testing. It's
excluded via `.gitignore` and never committed.

## License and bundled content

- The license for this repository's own code is unspecified (internal
  tooling).
- The NP2kai-wasm build artifacts under `public/core/`
  (`emnp21kai_sdl2.js` / `emnp21kai_sdl2.wasm` / `font.bmp`) are build
  output of NP2kai, which is BSD-family licensed; see
  `public/core/LICENSE.NP2kai` for the full license text.
- **No PC-98 ROM images or commercial software disk images are bundled with
  this repository.** `font.bmp` is font data derived from the Shinonome
  font project and is unrelated to, and does not raise the same copyright
  concerns as, real PC-98 ROM images.
- `public/freedos/fd98_2hd.xdf` is the FreeDOS(98) boot floppy described
  above, licensed under GPLv2+; source is available from
  [lpproj/fdkernel](https://github.com/lpproj/fdkernel) and
  [lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2). See
  `public/freedos/README.txt` for details.
- Users are responsible for legally obtaining and using any disk images they
  load via the `hdd`/`fd1`/`fd2` parameters or drag & drop.

## Implemented features

- URL parameter loading with fetch progress display, drag & drop image loading
- Persistence via IndexedDB (auto-save, resume from previous state, reset)
- Hot FD swap/eject and blank FD creation while running, machine reset
- Save states (carried across sessions via IndexedDB)
- Screenshot capture (640x400 PNG)
- Bundled FreeDOS(98) boot, `run=1` auto-boot with mute banner
- Disk image download, fullscreen, Japanese/English UI toggle
- Smartphone support (touch controls, PC-98 on-screen keyboard)
- Low-latency audio output via AudioWorklet (default; auto-falls back to the legacy SDL path)
- Automatic GitHub Pages deployment via GitHub Actions

Future plans (WebSocket/MCP integration, mobile UI, etc.) are
covered in [docs/DESIGN.md](docs/DESIGN.md).
