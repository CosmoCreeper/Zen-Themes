interface ScrollOwner {
  destroy(): void;
}
interface SharedSectionScrolling {
  version?: number;
  owners: Map<object, MediaQueryList>;
  release(owner: object): void;
}
declare global {
  interface Window {
    __superPinsSlotSizing?: ScrollOwner;
    __zenSectionScrollRepair?: SharedSectionScrolling;
  }
}
declare const gBrowser: { selectedTab: Element };

/* Gecko needs author-origin ::part sizing for the native shadow slot.
 * Section scrolling keeps native input behavior through the shared support below.
 * No preferences, tabs, folders, or native methods are changed by this module.
 */
(() => {
  const key = "__superPinsSlotSizing";
  window[key]?.destroy();
  const query =
    '(-moz-pref("zen.tabs.vertical")) and (-moz-pref("uc.pins.stay-at-top"))';
  const style = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "style"
  );
  style.id = "superpins-slot-sizing";
  style.textContent = `@media ${query} {
    #tabbrowser-arrowscrollbox > zen-workspace[active="true"] >
    arrowscrollbox.workspace-arrowscrollbox::part(items-wrapper) { min-height: 0 !important; }
  }`;
  document.documentElement.appendChild(style);
  const owner = {
    destroy: () => {
      release();
      style.remove();
      window.removeEventListener("unload", owner.destroy);
      if (window[key] === owner) delete window[key];
    },
  };
  window[key] = owner;
  const release = acquireSectionScrolling(owner, window.matchMedia(query));
  if (typeof window.addUnloadListener === "function")
    window.addUnloadListener(owner.destroy);
  else window.addEventListener("unload", owner.destroy, { once: true });
  // Both mods share one set of listeners; unloading either keeps the other alive.
  // The native selection reveal is gated on the outer scroller overflowing, which
  // is false once these mods use section scrollers. No keyboard/drop handlers are
  // replaced, and all actual selection, grouping and dropping remains native.
  // Version 2 adds drag edge-scrolling for the ordinary tab list. Each mod ships a
  // copy, so a newer copy takes over an older one whichever mod loads first.
  function acquireSectionScrolling(owner: object, media: MediaQueryList) {
    const key = "__zenSectionScrollRepair",
      version = 2;
    let shared = window[key];
    if (shared && !((shared.version ?? 0) >= version)) {
      const previous = shared,
        moved = [...previous.owners];
      for (const [old] of moved) previous.release(old);
      const next = create();
      for (const [old, query] of moved) next.owners.set(old, query);
      // The older mod still holds the old object; route its unload here.
      previous.release = (old: object) => next.release(old);
      shared = next;
    } else if (!shared) shared = create();
    const current = shared;
    current.owners.set(owner, media);
    return () => current.release(owner);

    function create(): SharedSectionScrolling {
      const PINNED =
        'zen-workspace[active="true"] .zen-workspace-pinned-tabs-section';
      const NORMAL =
        '#tabbrowser-arrowscrollbox > zen-workspace[active="true"] .zen-workspace-normal-tabs-section';
      // Edge strip in px; speed in px per ms, rising with depth into the strip.
      const EDGE = 48,
        SLOW = 0.25,
        FAST = 1.6;
      const rate = (depth: number) =>
        SLOW + (FAST - SLOW) * Math.min(1, depth) ** 2;
      const owners = new Map<object, MediaQueryList>();
      let revealFrame = 0,
        dragFrame = 0,
        dragSpeed = 0,
        lastTime = 0;
      let dragPane: Element | null = null;
      const active = () => [...owners.values()].some((query) => query.matches);
      const reveal = (event: Event) => {
        if (!active()) return;
        const target =
          event.type === "focusin"
            ? (event.target as Element | null)?.closest?.(
                "tab, .tab-group-label-container"
              )
            : gBrowser.selectedTab;
        if (
          !target?.closest(
            'zen-workspace[active="true"] .zen-workspace-tabs-section'
          )
        )
          return;
        cancelAnimationFrame(revealFrame);
        revealFrame = requestAnimationFrame(() => {
          revealFrame = 0;
          if (
            active() &&
            target.isConnected &&
            target.getBoundingClientRect().height
          ) {
            target.scrollIntoView({
              block: "nearest",
              inline: "nearest",
              behavior: "instant",
            });
          }
        });
      };
      const stopDrag = () => {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        dragPane = null;
        dragSpeed = 0;
        lastTime = 0;
      };
      const atLimit = (pane: Element, speed: number) =>
        speed < 0
          ? pane.scrollTop <= 0
          : pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
      const tick = (now: number) => {
        dragFrame = 0;
        if (
          !active() ||
          !dragPane?.isConnected ||
          atLimit(dragPane, dragSpeed)
        ) {
          stopDrag();
          return;
        }
        const elapsed = lastTime ? Math.min(now - lastTime, 50) : 16;
        lastTime = now;
        dragPane.scrollTop += dragSpeed * elapsed;
        dragFrame = requestAnimationFrame(tick);
      };
      const overflows = (pane: Element) =>
        pane.scrollHeight > pane.clientHeight;
      // Returns [pane, speed] for a drag at an overflowing section's top or
      // bottom strip, or just above the ordinary list (the New Tab row or the
      // separator, where the pointer lands when moving tabs up), else null.
      const edgeScroll = (event: DragEvent): [Element, number] | null => {
        const x = event.clientX,
          y = event.clientY,
          target = event.target as Element | null;
        const pane = target?.closest?.(PINNED) || target?.closest?.(NORMAL);
        if (pane) {
          if (!overflows(pane)) return null;
          const r = pane.getBoundingClientRect(),
            edge = Math.min(EDGE, r.height / 3);
          if (x < r.left || x > r.right || y < r.top || y > r.bottom)
            return null;
          if (y < r.top + edge) return [pane, -rate((r.top + edge - y) / edge)];
          if (y > r.bottom - edge)
            return [pane, rate((y - r.bottom + edge) / edge)];
          return null;
        }
        const normal = document.querySelector?.(NORMAL);
        if (!normal || !overflows(normal) || normal.scrollTop <= 0) return null;
        const r = normal.getBoundingClientRect();
        return x >= r.left && x <= r.right && y < r.top && y >= r.top - EDGE
          ? [normal, -FAST]
          : null;
      };
      const dragOver = (input: Event) => {
        const event = input as DragEvent;
        const scroll =
          active() && event.dataTransfer?.types.length
            ? edgeScroll(event)
            : null;
        if (!scroll) {
          stopDrag();
          return;
        }
        [dragPane, dragSpeed] = scroll;
        if (!dragFrame) dragFrame = requestAnimationFrame(tick);
      };
      // dragover recomputes the zone; only leaving the window needs a stop here.
      const dragLeave = (input: Event) => {
        if (dragPane && !(input as DragEvent).relatedTarget) stopDrag();
      };
      const events: [string, EventListener][] = [
        ["TabSelect", reveal],
        ["focusin", reveal],
        ["resize", reveal],
        ["dragover", dragOver],
        ["dragleave", dragLeave],
        ["drop", stopDrag],
        ["dragend", stopDrag],
        ["blur", stopDrag],
      ];
      for (const [name, fn] of events) window.addEventListener(name, fn, true);
      const created: SharedSectionScrolling = {
        version,
        owners,
        release(owner: object) {
          owners.delete(owner);
          if (owners.size) return;
          cancelAnimationFrame(revealFrame);
          stopDrag();
          for (const [name, fn] of events)
            window.removeEventListener(name, fn, true);
          if (window[key] === created) delete window[key];
        },
      };
      window[key] = created;
      return created;
    }
  }
})();
