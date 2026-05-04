// DOM-aware positioning helpers for filter panels.
// Implements the "anchor below trigger, auto-flip on overflow" behavior.

const MARGIN = 8;

export function placePanel(panel: HTMLElement): void {
  // Reset to default placement.
  panel.classList.remove('flip-x', 'flip-y');
  if (!panel.isConnected) return;
  // Force layout before measuring.
  const r = panel.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;  // not yet visible
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r.right > vw - MARGIN) panel.classList.add('flip-x');
  if (r.bottom > vh - MARGIN) panel.classList.add('flip-y');
}

export function isMobile(): boolean {
  return window.matchMedia('(max-width: 600px)').matches;
}
