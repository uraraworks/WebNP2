import type { SharedKeyInput } from '../api/shared-key-input.ts';
import type { InputProfile } from '../api/input-profile.ts';

const VPAD_SOURCE = 'vpad';

export type VpadWidget =
  | { kind: 'dpad'; ids: { up: string; down: string; left: string; right: string }; xPct: number; yPct: number; sizePct: number }
  | { kind: 'button'; id: string; label: string; xPct: number; yPct: number; sizePct: number };
export interface VpadRect { x: number; y: number; w: number; h: number }
export interface LaidOutWidget { widget: VpadWidget; rect: VpadRect }
export type VpadPlacement = 'panel' | 'overlay' | 'sides';
export interface VpadSideBoxes { left: VpadRect; right: VpadRect }
export interface SafeAreaInsets { left: number; right: number; top: number; bottom: number }

export const NO_SAFE_AREA: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * sides配置の左右ボックスを、ステージ(canvas)とセーフエリアから決める。
 *
 * index.html は viewport-fit=cover なので、ホーム画面から開いた
 * スタンドアロン横向きではビューポートがノッチの下まで広がる。
 * ボックスを x:0〜innerWidth のまま取ると、外縁へ寄る部品
 * (左のスティック / 右端のボタン) がノッチに隠れる。
 * ノッチは持ち方で左右どちらにも来るため、必ず両側を引く。
 */
export function vpadSideBoxesFor(
  stage: VpadRect,
  viewport: { width: number; height: number },
  insets: SafeAreaInsets,
): VpadSideBoxes {
  const top = Math.max(stage.y, insets.top);
  const bottom = Math.min(stage.y + stage.h, viewport.height - insets.bottom);
  const h = Math.max(0, bottom - top);
  const rightX = stage.x + stage.w;
  return {
    left: { x: insets.left, y: top, w: Math.max(0, stage.x - insets.left), h },
    right: { x: rightX, y: top, w: Math.max(0, viewport.width - insets.right - rightX), h },
  };
}

/**
 * 左右対称に返ってきたインセットから、実際に塞がっている側だけを残す。
 *
 * iOS は横向きのとき左右へ同じ値を返す(実測 iPhone: inner 852x393 / angle 90 /
 * inset left 59・right 59)。だが実際に隠れるのはノッチ側だけで、反対側は
 * 完全に見えている。セーフエリアを赤く塗って実機で確認したところ、
 * 隠れていたのはノッチ側の縦中央部分のみで、反対側は帯も文字も描画されていた。
 * 両方避けると片側ぶん(59px)を無駄に捨て、ボタンが1個ぶん小さくなる。
 *
 * angle 90 でノッチが左というのは上記の実機実測。270 はその逆と置く。
 * 左右が同値でないなら値そのものが正確なので触らない。角度が取れない、
 * または想定外の値なら両側を避ける従来動作へ倒す(安全側)。
 */
export function resolveLandscapeInsets(insets: SafeAreaInsets, angle: number | null): SafeAreaInsets {
  if (insets.left <= 0 || insets.left !== insets.right) return insets;
  if (angle === 90) return { ...insets, right: 0 };
  if (angle === 270) return { ...insets, left: 0 };
  return insets;
}

/** 画面の回転角。取れない環境では null。 */
export function screenAngle(): number | null {
  if (typeof screen === 'undefined') return null;
  const angle = screen.orientation?.angle;
  return typeof angle === 'number' ? angle : null;
}

/**
 * env(safe-area-inset-*) の実効値を px で読む。
 * カスタムプロパティ経由だと getComputedStyle が env() を解決しない環境があるため、
 * 実プロパティ(padding)へ入れた不可視の測定用要素から読む。要素は使い回す。
 */
let safeAreaProbe: HTMLElement | null = null;
export function readSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === 'undefined') return NO_SAFE_AREA;
  if (!safeAreaProbe || !safeAreaProbe.isConnected) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.className = 'safe-area-probe';
    document.body.append(safeAreaProbe);
  }
  const style = getComputedStyle(safeAreaProbe);
  const px = (value: string): number => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    left: px(style.paddingLeft),
    right: px(style.paddingRight),
    top: px(style.paddingTop),
    bottom: px(style.paddingBottom),
  };
}

const DPAD_IDS = { up: 'dpad-up', down: 'dpad-down', left: 'dpad-left', right: 'dpad-right' } as const;
const OVERLAY_DPAD: Extract<VpadWidget, { kind: 'dpad' }> = { kind: 'dpad', ids: DPAD_IDS, xPct: 18, yPct: 76, sizePct: 38 };
const PANEL_DPAD: Extract<VpadWidget, { kind: 'dpad' }> = { kind: 'dpad', ids: DPAD_IDS, xPct: 24, yPct: 55, sizePct: 62 };

interface ButtonSlot { xPct: number; yPct: number; sizePct: number }
export const VPAD_SLANT_PCT_PANEL = 5;
export const VPAD_SLANT_PCT_OVERLAY = 4;

function slantedButtonSlots(xs: readonly [number, number, number], lowerY: number, upperY: number, slant: number, size: number): ButtonSlot[] {
  return [
    { xPct: xs[0], yPct: lowerY, sizePct: size }, { xPct: xs[1], yPct: lowerY - slant, sizePct: size },
    { xPct: xs[2], yPct: lowerY - slant * 2, sizePct: size }, { xPct: xs[0], yPct: upperY, sizePct: size },
    { xPct: xs[1], yPct: upperY - slant, sizePct: size }, { xPct: xs[2], yPct: upperY - slant * 2, sizePct: size },
  ];
}

const OVERLAY_BUTTON_SLOTS = slantedButtonSlots([60, 74, 88], 82, 60, VPAD_SLANT_PCT_OVERLAY, 18);
const PANEL_BUTTON_SLOTS = slantedButtonSlots([58, 74, 90], 72, 30, VPAD_SLANT_PCT_PANEL, 22);
const BUTTON_IDS = ['btn-a', 'btn-b', 'btn-c', 'btn-d', 'btn-e', 'btn-f'] as const;
const BUTTON_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const SIX_BUTTON_MARKERS = new Set(['btn-c', 'btn-d', 'btn-e', 'btn-f']);

export const STICK_DEADZONE_RATIO = 0.18;
export const STICK_MAX_RADIUS_RATIO = 0.5;

export function placementForViewport(width: number, height: number): Exclude<VpadPlacement, 'overlay'> {
  return width > height ? 'sides' : 'panel';
}

export function vpadWidgetsFor(placement: VpadPlacement, boundIds: ReadonlySet<string>): VpadWidget[] {
  const widgets: VpadWidget[] = [];
  const dpad = placement === 'panel' ? PANEL_DPAD : OVERLAY_DPAD;
  if (Object.values(dpad.ids).some((id) => boundIds.has(id))) widgets.push(dpad);
  const slots = placement === 'panel' ? PANEL_BUTTON_SLOTS : OVERLAY_BUTTON_SLOTS;
  const sixButton = [...SIX_BUTTON_MARKERS].some((id) => boundIds.has(id));
  const buttonSlots = sixButton
    ? BUTTON_IDS.map((id, index) => ({ id, label: BUTTON_LABELS[index], slot: slots[index] }))
    : [{ id: 'btn-b', label: 'B', slot: slots[1] }, { id: 'btn-a', label: 'A', slot: slots[2] }];
  for (const entry of buttonSlots) {
    if (boundIds.has(entry.id)) widgets.push({ kind: 'button', id: entry.id, label: entry.label, ...entry.slot });
  }
  const optionSlots = placement === 'panel'
    ? [{ xPct: 34, yPct: 12, sizePct: 14 }, { xPct: 47, yPct: 12, sizePct: 14 }]
    : [{ xPct: 78, yPct: 8, sizePct: 10 }, { xPct: 90, yPct: 8, sizePct: 10 }];
  for (const [index, id] of ['btn-opt1', 'btn-opt2'].entries()) {
    if (boundIds.has(id)) widgets.push({ kind: 'button', id, label: String(index + 1), ...optionSlots[index] });
  }
  return widgets;
}

function clampRect(rect: VpadRect, width: number, height: number): VpadRect {
  return {
    ...rect,
    x: rect.w >= width ? 0 : Math.max(0, Math.min(rect.x, width - rect.w)),
    y: rect.h >= height ? 0 : Math.max(0, Math.min(rect.y, height - rect.h)),
  };
}

export function layoutVpad(width: number, height: number, widgets: readonly VpadWidget[]): LaidOutWidget[] {
  const base = Math.min(width, height);
  return widgets.map((widget) => {
    const size = base * widget.sizePct / 100;
    return { widget, rect: clampRect({ x: width * widget.xPct / 100 - size / 2, y: height * widget.yPct / 100 - size / 2, w: size, h: size }, width, height) };
  });
}

function clampRectToBox(rect: VpadRect, box: VpadRect): VpadRect {
  const local = clampRect({ x: rect.x - box.x, y: rect.y - box.y, w: rect.w, h: rect.h }, box.w, box.h);
  return { x: local.x + box.x, y: local.y + box.y, w: local.w, h: local.h };
}

/**
 * sides配置の充填率。左右のボックスは縦長で細いため、部品の大きさは
 * ほぼ「箱の幅」で決まる。縦向き(panel配置)より小さくなるので、
 * はみ出さず互いに重ならない範囲まで詰めて取る。
 * 値の根拠は隣の中心間距離で、たとえばオプション2個は中心が幅の
 * OPTION_SPREAD ぶん離れるので直径はそれを超えられない。
 */
const STICK_FILL = 0.9;
const OPTION_SPREAD = 0.46;
const OPTION_FILL = 0.92;
const OPTION_BAND_MAX = 0.25;
const BUTTON_FILL = 0.9;

export function layoutVpadSides(boxes: VpadSideBoxes, boundIds: ReadonlySet<string>): LaidOutWidget[] {
  const { left, right } = boxes;
  const widgets: LaidOutWidget[] = [];
  // オプション(1/2)の帯を先に取り、残りをスティックに割り当てる。
  // スティックを先に最大化して「余った隙間」をオプションに回すと、箱が横広に
  // なったときにオプションだけ極端に潰れる(実測 28.8px)。取り分は先に決める。
  const hasOptions = ['btn-opt1', 'btn-opt2'].some((id) => boundIds.has(id));
  const optionBand = hasOptions ? Math.min(left.w * OPTION_SPREAD, left.h * OPTION_BAND_MAX) : 0;
  const stickAreaY = left.y + optionBand;
  const stickAreaH = Math.max(0, left.h - optionBand);
  const stickDiameter = Math.min(left.w, stickAreaH) * STICK_FILL;
  const stickCenter = { x: left.x + left.w / 2, y: stickAreaY + stickAreaH / 2 };
  if (Object.values(DPAD_IDS).some((id) => boundIds.has(id))) {
    widgets.push({
      widget: { kind: 'dpad', ids: DPAD_IDS, xPct: 0, yPct: 0, sizePct: 0 },
      rect: clampRectToBox({ x: stickCenter.x - stickDiameter / 2, y: stickCenter.y - stickDiameter / 2, w: stickDiameter, h: stickDiameter }, left),
    });
  }
  const optionDiameter = Math.max(0, optionBand * OPTION_FILL);
  const optionRatios = [0.5 - OPTION_SPREAD / 2, 0.5 + OPTION_SPREAD / 2];
  for (const option of [{ id: 'btn-opt1', label: '1', ratio: optionRatios[0] }, { id: 'btn-opt2', label: '2', ratio: optionRatios[1] }]) {
    if (!boundIds.has(option.id)) continue;
    const centerX = left.x + left.w * option.ratio;
    const centerY = left.y + optionBand / 2;
    widgets.push({ widget: { kind: 'button', id: option.id, label: option.label, xPct: 0, yPct: 0, sizePct: 0 }, rect: clampRectToBox({ x: centerX - optionDiameter / 2, y: centerY - optionDiameter / 2, w: optionDiameter, h: optionDiameter }, left) });
  }
  const sixButton = [...SIX_BUTTON_MARKERS].some((id) => boundIds.has(id));
  const grid = sixButton
    ? BUTTON_IDS.map((id, index) => ({ id, label: BUTTON_LABELS[index], row: index < 3 ? 1 : 0, col: index % 3 }))
    : [{ id: 'btn-b', label: 'B', row: 1, col: 1 }, { id: 'btn-a', label: 'A', row: 1, col: 2 }];
  // 段/列は「実際に使う数」で割る。2ボタン構成は col 1,2 の2列しか使わないので、
  // 常に3で割っていると横幅を1列ぶん捨てたままボタンが小さくなる。
  const usedCols = grid.filter((slot) => boundIds.has(slot.id)).map((slot) => slot.col);
  const usedRows = grid.filter((slot) => boundIds.has(slot.id)).map((slot) => slot.row);
  const minCol = usedCols.length > 0 ? Math.min(...usedCols) : 0;
  const colCount = usedCols.length > 0 ? Math.max(...usedCols) - minCol + 1 : 1;
  const rowCount = usedRows.length > 0 ? Math.max(...usedRows) - Math.min(...usedRows) + 1 : 1;
  const colPitch = right.w / colCount;
  const rowPitch = right.h / rowCount;
  const diameter = Math.min(colPitch, rowPitch) * BUTTON_FILL;
  const slant = right.h * 0.045;
  for (const slot of grid) {
    if (!boundIds.has(slot.id)) continue;
    const centerX = right.x + colPitch * (slot.col - minCol + 0.5);
    const centerY = right.y + right.h * (slot.row === 1 ? 0.68 : 0.3) - slant * slot.col;
    widgets.push({ widget: { kind: 'button', id: slot.id, label: slot.label, xPct: 0, yPct: 0, sizePct: 0 }, rect: clampRectToBox({ x: centerX - diameter / 2, y: centerY - diameter / 2, w: diameter, h: diameter }, right) });
  }
  return widgets;
}

export function stickDirsFromPoint(widget: Extract<VpadWidget, { kind: 'dpad' }>, rect: VpadRect, x: number, y: number): string[] {
  const dx = x - (rect.x + rect.w / 2);
  const dy = y - (rect.y + rect.h / 2);
  if (Math.hypot(dx, dy) < Math.min(rect.w, rect.h) * STICK_DEADZONE_RATIO) return [];
  let degrees = Math.atan2(dy, dx) * 180 / Math.PI;
  if (degrees < 0) degrees += 360;
  switch (Math.round(degrees / 45) % 8) {
    case 0: return [widget.ids.right];
    case 1: return [widget.ids.right, widget.ids.down];
    case 2: return [widget.ids.down];
    case 3: return [widget.ids.down, widget.ids.left];
    case 4: return [widget.ids.left];
    case 5: return [widget.ids.left, widget.ids.up];
    case 6: return [widget.ids.up];
    default: return [widget.ids.up, widget.ids.right];
  }
}

export function stickKnobOffset(rect: VpadRect, x: number, y: number): { x: number; y: number } {
  const dx = x - (rect.x + rect.w / 2);
  const dy = y - (rect.y + rect.h / 2);
  const distance = Math.hypot(dx, dy);
  const max = Math.min(rect.w, rect.h) * STICK_MAX_RADIUS_RATIO;
  return distance > max && distance > 0 ? { x: dx / distance * max, y: dy / distance * max } : { x: dx, y: dy };
}

function circleHit(rect: VpadRect, x: number, y: number): boolean {
  const dx = x - (rect.x + rect.w / 2);
  const dy = y - (rect.y + rect.h / 2);
  const radius = Math.min(rect.w, rect.h) / 2;
  return dx * dx + dy * dy <= radius * radius;
}

export function hitTestVpad(widgets: readonly LaidOutWidget[], x: number, y: number): string[] {
  const hits: string[] = [];
  for (const item of widgets) {
    if (!circleHit(item.rect, x, y)) continue;
    if (item.widget.kind === 'dpad') hits.push(...stickDirsFromPoint(item.widget, item.rect, x, y));
    else hits.push(item.widget.id);
  }
  return hits;
}

export interface VirtualPad {
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setProfile(profile: InputProfile | null): void;
  refreshLayout(): void;
  releaseAll(): void;
  setPlacement(placement: VpadPlacement, sidesBoxes?: VpadSideBoxes): void;
}

export function createVirtualPad(overlay: HTMLElement, input: SharedKeyInput): VirtualPad {
  overlay.classList.add('virtual-pad', 'hidden');
  let profile: InputProfile | null = null;
  let placement: VpadPlacement = 'overlay';
  let sidesBoxes: VpadSideBoxes | null = null;
  let boundIds = new Set<string>();
  let widgets: VpadWidget[] = [];
  let laidOut: LaidOutWidget[] = [];
  let activeIds = new Set<string>();
  let pressedKeys = new Set<number>();
  const pointers = new Map<number, { stick: boolean; ids: string[] }>();
  const elements = new Map<string, HTMLElement>();
  let knob: HTMLElement | null = null;

  function refreshLayout(): void {
    if (placement === 'sides') {
      laidOut = sidesBoxes ? layoutVpadSides(sidesBoxes, boundIds) : [];
    } else {
      const bounds = overlay.getBoundingClientRect();
      laidOut = layoutVpad(bounds.width, bounds.height, widgets);
    }
    for (const { widget, rect } of laidOut) {
      const target = widget.kind === 'dpad' ? overlay.querySelector<HTMLElement>('.vpad-stick') : elements.get(widget.id);
      if (!target) continue;
      Object.assign(target.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    }
  }

  function applyActive(): void {
    const next = new Set<string>();
    for (const state of pointers.values()) for (const id of state.ids) next.add(id);
    for (const id of activeIds) if (!next.has(id)) elements.get(id)?.classList.remove('active');
    for (const id of next) if (!activeIds.has(id)) elements.get(id)?.classList.add('active');
    activeIds = next;
    const keys = new Set<number>();
    if (profile) for (const id of activeIds) {
      const binding = profile.bindings[id];
      if (binding) keys.add(binding.code);
    }
    for (const code of keys) if (!pressedKeys.has(code)) input.press(VPAD_SOURCE, code);
    for (const code of pressedKeys) if (!keys.has(code)) input.release(VPAD_SOURCE, code);
    pressedKeys = keys;
  }

  function releaseAll(): void {
    pointers.clear();
    applyActive();
    input.releaseSource(VPAD_SOURCE);
    knob?.classList.remove('active');
    if (knob) knob.style.transform = 'translate(0px, 0px)';
  }

  function build(): void {
    releaseAll();
    overlay.replaceChildren();
    elements.clear();
    knob = null;
    boundIds = new Set(profile ? Object.keys(profile.bindings) : []);
    widgets = vpadWidgetsFor(placement, boundIds);
    for (const widget of widgets) {
      if (widget.kind === 'dpad') {
        const stick = document.createElement('div'); stick.className = 'vpad-stick';
        knob = document.createElement('div'); knob.className = 'vpad-stick-knob'; stick.append(knob); overlay.append(stick);
      } else {
        const button = document.createElement('div'); button.className = 'vpad-button'; button.dataset.id = widget.id;
        button.setAttribute('role', 'button'); button.setAttribute('aria-label', widget.label); button.textContent = widget.label;
        overlay.append(button); elements.set(widget.id, button);
      }
    }
    refreshLayout();
  }

  function point(event: PointerEvent): { x: number; y: number } {
    const rect = overlay.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function updatePointer(event: PointerEvent, initial: boolean): void {
    const p = point(event);
    const stick = laidOut.find((item): item is LaidOutWidget & { widget: Extract<VpadWidget, { kind: 'dpad' }> } => item.widget.kind === 'dpad');
    const old = pointers.get(event.pointerId);
    const isStick = initial ? Boolean(stick && circleHit(stick.rect, p.x, p.y)) : old?.stick === true;
    const ids = isStick && stick ? stickDirsFromPoint(stick.widget, stick.rect, p.x, p.y) : hitTestVpad(laidOut, p.x, p.y);
    pointers.set(event.pointerId, { stick: isStick, ids });
    if (isStick && stick && knob) {
      const offset = stickKnobOffset(stick.rect, p.x, p.y);
      knob.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
      knob.classList.toggle('active', ids.length > 0);
    }
    applyActive();
  }

  overlay.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try { overlay.setPointerCapture(event.pointerId); } catch { /* 入力は継続する。 */ }
    updatePointer(event, true);
  });
  overlay.addEventListener('pointermove', (event) => { if (pointers.has(event.pointerId)) { event.preventDefault(); updatePointer(event, false); } });
  const end = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) return;
    const wasStick = pointers.get(event.pointerId)?.stick;
    pointers.delete(event.pointerId); applyActive();
    if (wasStick && ![...pointers.values()].some((state) => state.stick) && knob) {
      knob.style.transform = 'translate(0px, 0px)'; knob.classList.remove('active');
    }
  };
  overlay.addEventListener('pointerup', end); overlay.addEventListener('pointercancel', end);
  overlay.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('orientationchange', () => { releaseAll(); refreshLayout(); });
  window.addEventListener('resize', refreshLayout);
  window.addEventListener('pagehide', releaseAll);

  return {
    setVisible(visible) { overlay.classList.toggle('hidden', !visible); if (visible) refreshLayout(); else releaseAll(); },
    isVisible: () => !overlay.classList.contains('hidden'),
    setProfile(next) { profile = next; build(); },
    refreshLayout,
    releaseAll,
    setPlacement(next, nextSidesBoxes) {
      releaseAll();
      placement = next;
      if (nextSidesBoxes) sidesBoxes = nextSidesBoxes;
      overlay.classList.toggle('vpad-panel', next === 'panel');
      overlay.classList.toggle('vpad-overlay', next === 'overlay');
      overlay.classList.toggle('vpad-sides', next === 'sides');
      widgets = vpadWidgetsFor(placement, boundIds);
      refreshLayout();
    },
  };
}
