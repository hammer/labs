// Single-instance toast + deferred-destruction undo (issue #53).
//
// Contract: successful mutations are SILENT — the UI itself shows the result.
// A toast appears only as an undo affordance or a failure notice; one toast at
// a time, and arming a new undoable op commits the previous one.
//
// Undo inverts the usual mechanism: the caller removes the row from the UI
// optimistically, then arms {commit, restore}. commit() — the real DELETE;
// pass fetch(..., {keepalive: true}) so it survives navigation — runs when the
// toast expires, is replaced, or the page hides. Undo cancels it and restore()
// re-inserts the UI. Ids, timestamps, and positions survive undo because the
// server was never touched; a lost commit resurrects data rather than
// destroying it. Styles live in global.css (.ui-toast*).

type Tone = 'info' | 'error';

let box: HTMLDivElement | null = null;
let msgSpan: HTMLSpanElement;
let actBtn: HTMLButtonElement;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let remaining = 0;
let shownAt = 0;
let pendingCommit: (() => unknown) | null = null;

function ensure(): HTMLDivElement {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'ui-toast';
  box.hidden = true;
  box.setAttribute('role', 'status'); // polite live region
  msgSpan = document.createElement('span');
  msgSpan.className = 'ui-toast-msg';
  actBtn = document.createElement('button');
  actBtn.type = 'button';
  actBtn.className = 'ui-toast-action';
  box.append(msgSpan, actBtn);
  // Pause the countdown while hovered/focused — the Undo button is the
  // keyboard user's only path and the body-appended box is late in tab order.
  box.addEventListener('pointerenter', pause);
  box.addEventListener('pointerleave', resume);
  box.addEventListener('focusin', pause);
  box.addEventListener('focusout', resume);
  window.addEventListener('pagehide', () => { commitPendingUndo(); hide(); });
  document.body.appendChild(box);
  return box;
}

function pause() {
  if (!box || box.hidden || hideTimer === undefined) return;
  clearTimeout(hideTimer);
  hideTimer = undefined;
  remaining = Math.max(500, remaining - (Date.now() - shownAt));
}

function resume() {
  if (!box || box.hidden || hideTimer !== undefined) return;
  shownAt = Date.now();
  hideTimer = setTimeout(expire, remaining);
}

function expire() { commitPendingUndo(); hide(); }

function hide() {
  if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
  if (box) box.hidden = true;
}

// Run (and clear) the pending deferred destruction, returning its promise so
// callers that re-create the same key (e.g. re-adding a just-removed tag) can
// sequence the create after the delete lands.
export function commitPendingUndo(): Promise<unknown> {
  const c = pendingCommit;
  pendingCommit = null;
  return Promise.resolve(c ? c() : undefined);
}

function show(message: string, tone: Tone, action: { label: string; fn: () => void } | null, duration: number) {
  const b = ensure();
  commitPendingUndo(); // replacing a toast commits any prior deferred op
  if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
  msgSpan.textContent = message;
  b.classList.toggle('ui-toast-error', tone === 'error');
  if (action) {
    actBtn.textContent = action.label;
    actBtn.disabled = false;
    actBtn.hidden = false;
    actBtn.onclick = () => {
      actBtn.disabled = true; // guard double-activation
      pendingCommit = null;   // undo = cancel the deferred destruction
      action.fn();
      hide();
    };
  } else {
    actBtn.hidden = true;
    actBtn.onclick = null;
  }
  b.hidden = false;
  remaining = duration;
  shownAt = Date.now();
  hideTimer = setTimeout(expire, duration);
}

export function showToast(message: string, opts: { tone?: Tone } = {}) {
  show(message, opts.tone ?? 'info', null, 6000);
}

export function armUndo(message: string, opts: { commit: () => unknown; restore: () => void }) {
  show(message, 'info', { label: 'Undo', fn: opts.restore }, 6000);
  pendingCommit = opts.commit;
}
