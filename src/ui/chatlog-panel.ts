// ?chatlog=1 のときだけ出す確認用パネル(試作)。np2.onOutput のイベントを
// チャットログのように下へ追記表示する。既存UIには触れず、画面右下に重ねるだけ。
import type { WebNP2 } from '../api/webnp2.ts';

export function mountChatlogPanel(np2: WebNP2): () => void {
  const root = document.createElement('div');
  root.id = 'chatlog-panel';
  root.style.cssText =
    'position:fixed;right:8px;bottom:8px;width:520px;max-width:45vw;height:50vh;z-index:9999;display:flex;flex-direction:column;' +
    'background:#111c;color:#eee;font:11px/1.4 ui-monospace,Menlo,monospace;border:1px solid #666;border-radius:6px;';
  const srcLabel = document.createElement('div');
  srcLabel.dataset.role = 'source';
  srcLabel.style.cssText = 'font-size:9px;opacity:.6;text-align:right;padding:2px 6px 0;';
  srcLabel.textContent = '出力源: 判定中';
  const log = document.createElement('div');
  log.style.cssText = 'flex:1;overflow-y:auto;padding:6px;white-space:pre;overflow-x:auto;';
  const pending = document.createElement('div');
  pending.style.cssText = 'opacity:.55;min-height:1.4em;';
  pending.dataset.role = 'pending';
  log.appendChild(pending);
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter でゲストへ送信';
  input.style.cssText = 'border:0;border-top:1px solid #666;background:#000;color:#eee;padding:6px;font:inherit;';
  root.append(srcLabel, log, input);
  document.body.appendChild(root);

  const addLine = (text: string, cls?: string): void => {
    const d = document.createElement('div');
    d.textContent = text === '' ? ' ' : text;
    d.style.minHeight = '1.4em'; // 空行も1行分の高さを持たせる(pre 内の空白だけの div は高さ0に潰れる)
    if (cls) {
      d.style.cssText = 'opacity:.6;text-align:center;font-size:11px;';
      d.dataset.role = cls;
    }
    log.insertBefore(d, pending);
  };

  const onSource = (s: 'screen' | 'stream'): void => {
    srcLabel.textContent = s === 'stream' ? '出力源: stream (TSR)' : '出力源: screen (画面差分)';
    srcLabel.dataset.source = s;
  };
  const off = np2.onOutput((ev) => {
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    switch (ev.type) {
      case 'line':
        addLine(ev.text);
        break;
      case 'pending':
        pending.textContent = ev.text;
        break;
      case 'clear':
        addLine('— 画面消去 —', 'sep');
        pending.textContent = '';
        break;
      case 'takeover':
        addLine('— 画面モードに切替 —', 'sep');
        break;
      case 'gap':
        addLine('— 出力が速すぎて一部省略 —', 'sep');
        break;
    }
    if (stick) log.scrollTop = log.scrollHeight;
  }, { source: 'auto', onSource });

  // パネル内のキー入力がゲストへ漏れないようにする。ホストキー割当やSDLのリスナーは window の
  // capture で先に受けて preventDefault するため、入力欄まで文字が届かなくなる(実機で確認)。
  // こちらも window の capture で、対象が入力欄のときだけ後続リスナーを止める。
  // 後続を止めるため入力欄自身のリスナーには届かない。Enter の送信もここで処理する。
  const send = (): void => {
    const text = input.value;
    input.value = '';
    // 既存の np2.typeText(キーを1文字ずつ注入)を使う。末尾の \n は Enter キーになる。
    void np2.typeText(`${text}\n`).catch((err) => addLine(`送信失敗: ${String(err)}`, 'sep'));
  };
  const guard = (e: KeyboardEvent): void => {
    if (e.target !== input) return;
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      send();
    }
  };
  for (const t of ['keydown', 'keyup', 'keypress'] as const) window.addEventListener(t, guard, true);

  return () => {
    off();
    for (const t of ['keydown', 'keyup', 'keypress'] as const) window.removeEventListener(t, guard, true);
    root.remove();
  };
}
