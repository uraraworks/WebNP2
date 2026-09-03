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
from **More (…) → Help** in the player.

### URL parameters

```
https://.../?hdd=<HDD image URL>&fd1=<FD1 image URL>&fd2=<FD2 image URL>&run=1&clk=<multiplier>&lang=ja
```

| Parameter | Meaning | Notes |
|---|---|---|
| `hdd` | URL of an HDD image | NP2kai-compatible formats (`.thd`, etc.). If the fetched content is a ZIP/LZH archive, it's automatically extracted and the disk image(s) inside are registered to the Disk Library before use |
| `fd1` / `fd2` | URL of a floppy disk image | `.d88`, `.fdi`, etc. A ZIP/LZH archive is auto-extracted the same way as `hdd` |
| `lib` | URL of a disk image to register in the Disk Library only (repeatable) | See below |
| `run` | `1` to boot immediately without the start overlay | Due to browser autoplay restrictions the emulator starts muted, showing an "Audio is muted" banner; audio is enabled on your first click or key press |
| `mem` | Extended memory size in MB | Defaults to `1` (640 KB conventional + 1 MB extended — a typical DOS setup). Increase it (e.g. `mem=13`) for software that needs more memory. Clamped to 0–230 |
| `clk` | Clock multiplier | Written to the core cfg as `clk_mult` (integer, clamped to 1–32). Core default when omitted |
| `lang` | UI language (`ja` / `en`) | If omitted, resolved in order: `localStorage['webnp2.lang']` → the browser's `navigator.language` (`ja` if it starts with `ja`) → default `en`. Switch it from **More (…) → Language**; the choice is persisted and reused on subsequent visits |
| `freedos` | `1` to boot the bundled FreeDOS(98) floppy | Mounts `public/freedos/fd98_2hd.xdf` as FD1 (unless `fd1` is also given, which takes priority). Combine with `run=1` to ride the existing auto-start flow |
| `worklet` | `0` to disable low-latency AudioWorklet audio output | Falls back to the legacy SDL (ScriptProcessor) path. Enabled by default; auto-falls back on unsupported browsers too |
| `alat` | Initial low-water mark of the AudioWorklet ring buffer, in ms | Lower is lower-latency but more prone to dropouts. Defaults to one core chunk (~23ms). Raised automatically when dropouts are detected |
| `perf` | `1` shows a performance overlay (FPS / main-thread busy / audio supply) | For diagnosing slowdowns |

If no `hdd`/`fd1`/`fd2`/`freedos` parameters are given, the start overlay offers
two choices: "Start As-Is" (no image loaded — drag and drop an HDD/FD image
onto the screen afterward) or "Start with FreeDOS(98)" (boots the bundled
FreeDOS(98) floppy described below). If the Disk Library is not empty, a third
"Boot from Saved Disk" button is also shown. If any disk is specified via URL
parameters, the overlay instead shows the single traditional "Click to Start"
button. Only the displayed buttons start the emulator; clicking empty overlay
space does nothing, preventing accidental boots.

**Important: any URL passed via `hdd`/`fd1`/`fd2` must be served from an origin
with CORS (`Access-Control-Allow-Origin`) enabled.** Images are fetched with
the browser's `fetch` API, so if the hosting server doesn't send the
appropriate CORS headers, the fetch will fail and an error message will be
shown on screen. GitHub raw, GitHub Pages, and your own CORS-enabled server
work directly (plain fetch).

For Dropbox, you can **paste the share URL exactly as "Copy link" gives it to
you** — no need to change `dl=0` to `dl=1`. The app rewrites the hostname to
`dl.dropboxusercontent.com` and fetches it directly, so no relay is involved.
Only file share links (the `/scl/fi/...` form) have been verified; the older
`/s/...` form, folder shares, and password-protected links are untested (the
rewrite may not cover them, in which case the relay below is used as a
fallback).

Google Drive doesn't support CORS for a direct fetch, so it fails
at first, but the public page **automatically retries through a relay
service** (only when the direct fetch fails). If you fork and host this
yourself, you need to set `VITE_DISK_PROXY` (see below) to use this.
**OneDrive share links (`1drv.ms` / `onedrive.live.com` / `sharepoint.com`)
are not supported** — they don't work even through the relay (confirmed by
testing). Please use Dropbox or Google Drive instead.

Even when a `hdd`/`fd1`/`fd2` URL can't be judged by its extension (e.g. a
distribution URL with no extension), the fetched bytes are checked for a
leading ZIP/LZH signature and auto-detected as an archive. If extraction
yields a single disk image, it's used directly for that slot; if it yields
two or more, WebNP2 can't decide which one to use, so it skips auto-boot
(even with `run=1`) and opens the Disk Library instead, with the matching
folder expanded and highlighted so you can pick one. If the archive doesn't
contain an image matching the requested slot (e.g. a `hdd` archive that only
contains FD images), an error message is shown and startup is aborted. Once
a URL has been extracted, it stays registered in IndexedDB, so opening the
same URL again resumes from the Disk Library instead of re-downloading it.

Notes on `lib` (for sharing links to multi-disk collections):

- Use `?lib=<url>` and repeat it (`&lib=<url2>`, ...) to specify **multiple
  URLs** (comma-separated values aren't supported, since a URL itself can
  contain a comma).
- Unlike `fd1`/`fd2`/`hdd`, `lib` registers images **regardless of their kind**
  (FD or HDD) — a ZIP mixing HDD and FD images can be registered as-is (the
  usual kind check still applies once you insert an image into a slot).
- Regardless of how many disk images it resolves to, `lib` never auto-inserts
  into a slot — it **always opens the Disk Library** so the recipient can pick
  what to use.
- `run=1` is skipped whenever `lib` is given (the Disk Library opens instead
  of auto-booting).
- If combined with `fd1`/`fd2`/`hdd`, those URLs aren't discarded — WebNP2
  only resolves them once you actually start the emulator (via the overlay's
  start button), so pressing that button afterward still boots with them,
  exactly as it would without `run=1`.
- Fetching, resuming on revisit, and archive extraction follow the same rules
  as `fd1`/`fd2`/`hdd` (CORS required, no re-download on revisit, ZIP/LZH
  auto-extracted).

### Drag & drop

Dropping a file onto the screen area auto-detects whether it's an HDD or FD
image based on its extension.

- HDD: `.thd` `.hdi` `.nhd` `.hdd`
- FD: follows the formats accepted by the NP2kai core itself
  (`np2_isfdimage()` in
  [NP2kai/sdl/np2.c](https://github.com/AZO234/NP2kai)): `.d88` `.d98` `.fdi`
  `.hdm` `.xdf` `.dup` `.2hd` `.nfd` `.fdd` `.hd4` `.hd5` `.hd9` `.h01` `.hdb`
  `.ddb` `.dd6` `.dd9` `.dcp` `.dcu` `.flp` `.tfd` `.fim` `.img` `.ima` — except
  `.bin`, which is excluded because it's too generic and prone to false
  positives
- Archives: `.zip` `.lzh`

Dropping multiple files at once shows a confirmation dialog.

**HDDs can only be handled before boot.** The emulator core cannot swap a HDD
while running, so dropping a HDD image before boot no longer starts the machine:
it is *set* into the HDD slot instead (the slot name is shown in italics). While
it is only set, you can edit its contents from the file transfer dialog, then
press the boot button when you're ready. After boot, both the HDD slot buttons
and the HDD entries in the file transfer target list are disabled.

Archives are extracted and only the disk images inside are added to the Disk
Library (readme files and the like are ignored). A single disk boots right
away; an archive with multiple disks is grouped into a folder named after the
archive and the Disk Library opens so you can choose which disk to boot from.
Archives can also be dropped while the emulator is running to import them.

Dropping a disk image or archive onto the Disk Library dialog itself only
registers it in the library, without setting it into any slot. An archive
with multiple disks is likewise grouped into a folder that's expanded and
highlighted.

### Keyboard and mouse

- Key input is delivered to the guest as raw scancodes. PC-98 specific keys are
  mapped as XFER = right Alt (right Option) and NFER = left Alt (left Option).
- **Kanji input inside the guest** requires a guest-side FEP (a resident
  kana-kanji conversion program such as ATOK or VJE-β). Your host OS IME has no
  effect on the emulator screen (turn it off while typing). FreeDOS(98) does
  not include a FEP, so use your own MS-DOS + FEP disk images for kanji input.
- **Mouse** support is enabled from **More (…) → Input → Capture Mouse** (the
  pointer is locked to the screen and emulated as a PC-98 bus mouse; press Esc
  to release). The DOS prompt itself does not use a mouse. Software that reads
  the bus mouse directly works as-is; software using the int 33h API needs a
  guest-side mouse driver (MOUSE.SYS etc.).
- If mouse-driven software feels sluggish, raising the clock multiplier (e.g.
  `?clk=8`) helps. Don't raise it beyond what your machine can emulate in
  real time, though — the emulation starts dropping frames and gets choppy.

### Input controls

- The on-screen keyboard includes the PC-98 numeric keypad, but it is hidden by
  default; toggle it with the “Tenkey” key inside the keyboard panel (useful on
  laptops without a physical keypad, for software that needs tenkey movement).
- Open **More (…) → Input → Input Settings** to configure three tabs:
  **Gamepad**, **Keyboard**, and **Virtual Pad**. Each tab uses the same PC-98
  keyboard picker for choosing output keys.
- Physical gamepad buttons and axes can be mapped to PC-98 keys. Host keyboard
  remapping is off by default and provides named profiles, including the built-in
  “Tenkey Movement (Arrows → Tenkey)” profile.
- The Virtual Pad is intended primarily for phones and tablets. In portrait it
  appears below the emulator screen; in landscape its controls occupy the left
  and right margins so fingers do not cover the game.
- The Virtual Trackpad turns a one-finger drag into relative cursor movement, a
  short tap into a left click, a two-finger tap into a right click, and a
  press-and-hold (about 450ms without moving) followed by a drag into a
  left-button drag. The classic absolute-tracking touch on the emulator canvas
  itself still works alongside it. A two-finger drag (the usual trackpad
  gesture for scrolling) is not implemented, since the PC-98 bus mouse only has
  two buttons and nothing on the guest side would receive it.
- While the on-screen keyboard, Virtual Pad, or Virtual Trackpad is visible, a
  **⌨ / 🎮 / 🖱** switch appears immediately after the keyboard button. Press
  the active 🎮 side again to choose a Virtual Pad profile or edit assignments.
  While any input panel is open, the layout shrinks to fit one screen, which
  temporarily hides the floppy slot row (close the panel before swapping
  disks).

The toolbar keeps Pause, Fullscreen, On-screen Keyboard, Screenshot, and More
(…) centered, with Reset Machine split off to the right end (so an accidental
tap doesn't wipe out whatever state is currently running). The More menu
groups less frequent actions under Input, Sound, Disk, and State, with ROM
Files, Debugger, Help, and Language as direct rows. Language is shown with a
globe icon and its current value (“English” or “日本語”).

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

Setup is a single self-contained file — no `git clone`, no `npm install`,
just Node.js 18+:

```sh
curl -fLO https://github.com/uraraworks/WebNP2/releases/latest/download/webnp2-mcp.mjs
claude mcp add webnp2 -- node "$PWD/webnp2-mcp.mjs"
```

Then open `https://uraraworks.github.io/WebNP2/?freedos=1&run=1&bridge=1`
in your browser. Full instructions and the tool list live in
[mcp/README.md](mcp/README.md). To have your AI agent set it up for you,
just point it at that file and say "set up MCP access to WebNP2 as
described here".

Note: with the public (https) page, use a Chromium-based browser or
Firefox — Safari blocks `ws://` connections from https pages even to
localhost.

## Development

```sh
npm install
npm run dev       # dev server
npm run build     # type-check + production build (dist/)
npm run build:embed # build the reusable ESM embed package + type declarations
npm run preview   # preview the production build
npm test          # unit tests (vitest)
```

To enable relay fetching for Google Drive (and as a fallback for Dropbox share
links the hostname rewrite can't cover), set the `VITE_DISK_PROXY`
environment variable at build time to the URL of your own relay service (no
trailing `/`). If unset (the default), no relay is used and sources that the
direct fetch fails for will simply error out. See the comment in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) for how this is
configured for the public GitHub Pages build.

The reusable engine/debugger/UI-component API is documented in
[`packages/embed/README.md`](packages/embed/README.md).

### Updating the help screenshots

`public/help/*.png` are the illustrations used by the help page (help.html).
Retake them whenever the UI changes. With the dev server running, the following
recaptures all 18 images (ja/en) with the same framing — the library samples are
generated by the script, so no real disk images are needed.

```sh
npm run dev            # in another terminal
npm run capture-help
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
- ROM-less boot is implemented via NP2kai's built-in BIOS-compatible
  routine (inherited unmodified from upstream NP2/NP2kai, BSD-licensed
  source). As part of this routine, the string
  `"Copyright (C) 1983 by NEC Corporation"` is placed at the same guest
  memory location as on real hardware; some software uses this string for
  NEC machine-type detection. This is upstream behavior carried over as-is
  for software compatibility, not something added by this repository, and
  the string is present in the bundled wasm build (see NP2kai's
  `bios/bios.c`).
- `public/freedos/fd98_2hd.xdf` is the FreeDOS(98) boot floppy described
  above, licensed under GPLv2+; source is available from
  [lpproj/fdkernel](https://github.com/lpproj/fdkernel) and
  [lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2). See
  `public/freedos/README.txt` for details.
- `public/rhythm/2608_bd.wav`, `2608_sd.wav`, `2608_top.wav`, `2608_hh.wav`,
  `2608_tom.wav`, and `2608_rim.wav` are a bundled substitute for the YM2608
  rhythm sound source samples, used so rhythm playback is not silent even
  when no real samples are registered ("YM2608風リズム音源音色データ Ver.2.0",
  by メモル / Takanori YOSHIMURA, memoru@kisoba.info, distributed from
  <https://sound.jp/jaime/fmp_top.html> — archived at
  <https://sound.jp/jaime/files/2608modoki2.zip>). Per the author's own
  terms (quoted from the bundled text, translated): "Free to distribute,
  reprint, or embed in software, for free or for a fee. If you embed it in
  software or a sample pack, a note of what title used it would be
  appreciated." **These are not extracted from a real YM2608 chip's ROM.**
  As the author states, they were assembled by editing samples from other
  sound sources to resemble the YM2608's rhythm sounds, and the author
  explicitly notes the waveforms are fundamentally different from the real
  chip's. If you register real `2608_*.wav` files via the ROM/asset dialog,
  they take priority over this bundled substitute (see
  [src/api/roms.ts](src/api/roms.ts)).
- Users are responsible for legally obtaining and using any disk images they
  load via the `hdd`/`fd1`/`fd2` parameters or drag & drop.

## Implemented features

- URL parameter loading with fetch progress display, drag & drop image loading
- Persistence via IndexedDB (auto-save, resume from previous state, reset)
- Hot FD swap/eject and blank FD creation while running, machine reset
- Pause/resume (the screen dims and resume only works from the center play
  button while paused; lowers host CPU load — measured: about 62% while
  running, settling to 1–3% within a few seconds after pausing)
- Mute (off by default; zeroes only the output-stage volume) and FDD seek
  sound on/off (on by default; its waveform is embedded in the core, so no
  extra sound file is needed). Both settings persist to localStorage and are
  restored on the next launch
- Setting a HDD before boot (from the library, a drop, or the slot buttons), and
  editing its contents while it is only set
- Blank HDD creation (40MB, FAT16-formatted; carries no IPL, so it is a data
  drive only)
- Drive access lamps (FDD1/FDD2/HDD glow red while being read or written)
- Save states (carried across sessions via IndexedDB)
- Screenshot capture (640x400/640x480 PNG, matching the active video mode)
- Bundled FreeDOS(98) boot, `run=1` auto-boot with mute banner
- Disk image download, fullscreen, Japanese/English UI toggle
- Disk library organization (.zip/.lzh import, multi-disk folders, renaming,
  and an insert-from-library menu on each FD slot)
- Smartphone support (touch controls, PC-98 on-screen keyboard with a
  toggleable tenkey block, an automatically placed Virtual Pad, and a
  Virtual Trackpad)
- Dark `#101010` page background, keeping the off-screen Virtual Pad controls visible
- Physical gamepad mapping and named host-key remapping profiles
- Three-tab Input Settings dialog with a shared PC-98 keyboard picker
- File transfer dialog between the browser and a disk image (with .lzh/.zip auto-extraction)
- Low-latency audio output via AudioWorklet (default; auto-falls back to the legacy SDL path)
- Automatic GitHub Pages deployment via GitHub Actions

Further implementation details and plans are
covered in [docs/DESIGN.md](docs/DESIGN.md).
