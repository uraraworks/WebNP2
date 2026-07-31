# WebNP2

[日本語](README.ja.md)

A web-based PC-98 emulator player, powered by [NP2kai](https://github.com/AZO234/NP2kai)
compiled to WebAssembly (NP2kai-wasm). The goal is a "just open the URL and
play" experience — launch, play, and resume — with progress carried across
sessions.

This is the Phase 1 (MVP) implementation. See [docs/DESIGN.md](docs/DESIGN.md)
for design details.

## Usage

### URL parameters

```
https://.../?hdd=<HDD image URL>&fd1=<FD1 image URL>&fd2=<FD2 image URL>&run=1&clk=<multiplier>&lang=ja
```

| Parameter | Meaning | Notes |
|---|---|---|
| `hdd` | URL of an HDD image | NP2kai-compatible formats (`.thd`, etc.) |
| `fd1` / `fd2` | URL of a floppy disk image | `.d88`, `.fdi`, etc. |
| `run` | `1` to proceed with the auto-start flow | Because browsers restrict audio autoplay, even with `run=1` you still need to click the "Click to start" overlay to actually boot |
| `mem` | Extended memory size in MB | Defaults to `1` (640 KB conventional + 1 MB extended — a typical DOS setup). Increase it (e.g. `mem=13`) for software that needs more memory. Clamped to 0–230 |
| `clk` | Clock multiplier | Currently accepted but unused (reserved for Phase 2) |
| `lang` | UI language (`ja` / `en`) | If omitted, resolved in order: `localStorage['webnp2.lang']` → the browser's `navigator.language` (`ja` if it starts with `ja`) → default `en`. Can be switched at runtime with the language toggle button on the right side of the toolbar; the choice is persisted to `localStorage` and used as the default on subsequent visits |
| `freedos` | `1` to boot the bundled FreeDOS(98) floppy | Mounts `public/freedos/fd98_2hd.xdf` as FD1 (unless `fd1` is also given, which takes priority). Combine with `run=1` to ride the existing auto-start flow |

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

## Phase 1 (MVP) scope

- Repository scaffold (Vite + TypeScript)
- Core/API layer skeleton (Emscripten Module bootstrap, CommandBus)
- URL parameter loading with fetch progress display
- Drag & drop image loading
- Persistence via IndexedDB (auto-save, resume from previous state, reset)
- Disk image download
- Fullscreen display
- Structured for static hosting (e.g. GitHub Pages)

Phase 2 and beyond (hot-swapping disks while running, reset, save states,
settings UI, etc.) are covered in [docs/DESIGN.md](docs/DESIGN.md).
