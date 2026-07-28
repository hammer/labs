// Shared dropdown-menu behavior (issue #53), consolidating the hand-rolled
// copies in SavedViews / CollectionControl / mytags-filter — and fixing their
// shared bugs rather than replicating them:
// - one close() owns BOTH `hidden` and aria-expanded (the old copies desynced
//   aria-expanded on outside-click/Escape);
// - the outside-click listener runs in CAPTURE phase, so clicks on triggers
//   that stopPropagation (FilterBar's panel buttons) still close these menus;
// - Escape no-ops when nothing is open, and returns focus to the toggle only
//   when focus was inside the menu being closed;
// - opening any registered menu closes the others.

export interface MenuHandle { open(): void; close(): void; isOpen(): boolean; }

interface Entry { toggle: HTMLElement; menu: HTMLElement; handle: MenuHandle; }

const entries = new Set<Entry>();
let installed = false;

function installGlobal() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    for (const en of entries) {
      if (!en.menu.hidden && !en.toggle.contains(t) && !en.menu.contains(t)) en.handle.close();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const en of entries) {
      if (en.menu.hidden) continue;
      if (en.menu.contains(document.activeElement)) en.toggle.focus();
      en.handle.close();
    }
  });
}

export function attachMenu(toggle: HTMLElement, menu: HTMLElement, opts: { onOpen?: () => void } = {}): MenuHandle {
  const handle: MenuHandle = {
    open() {
      for (const en of entries) if (en.handle !== handle) en.handle.close();
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      opts.onOpen?.();
    },
    close() {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    },
    isOpen: () => !menu.hidden,
  };
  entries.add({ toggle, menu, handle });
  toggle.addEventListener('click', () => (menu.hidden ? handle.open() : handle.close()));
  installGlobal();
  return handle;
}
