interface ScrollOwner {
  destroy(): void;
}
interface SharedSectionScrolling {
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
  function acquireSectionScrolling(owner: object, media: MediaQueryList) {
    const key = "__zenSectionScrollRepair";
    let shared = window[key];
    if (!shared) {
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
      const tick = (now: number) => {
        dragFrame = 0;
        if (!active() || !dragPane?.isConnected) {
          stopDrag();
          return;
        }
        const elapsed = lastTime ? Math.min(now - lastTime, 50) : 16;
        lastTime = now;
        dragPane.scrollTop += dragSpeed * elapsed;
        dragFrame = requestAnimationFrame(tick);
      };
      const dragOver = (input: Event) => {
        const event = input as DragEvent;
        const pane = (event.target as Element | null)?.closest?.(
          'zen-workspace[active="true"] .zen-workspace-pinned-tabs-section'
        );
        if (
          !active() ||
          !pane ||
          !event.dataTransfer?.types.length ||
          pane.scrollHeight <= pane.clientHeight
        ) {
          stopDrag();
          return;
        }
        const r = pane.getBoundingClientRect(),
          edge = Math.min(40, r.height / 3);
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        ) {
          stopDrag();
          return;
        }
        dragSpeed =
          event.clientY < r.top + edge
            ? -0.45
            : event.clientY > r.bottom - edge
              ? 0.45
              : 0;
        if (!dragSpeed) {
          stopDrag();
          return;
        }
        dragPane = pane;
        if (!dragFrame) dragFrame = requestAnimationFrame(tick);
      };
      const dragLeave = (input: Event) => {
        const event = input as DragEvent;
        if (dragPane && !dragPane.contains(event.relatedTarget as Node | null))
          stopDrag();
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
      shared = {
        owners,
        release(owner: object) {
          owners.delete(owner);
          if (owners.size) return;
          cancelAnimationFrame(revealFrame);
          stopDrag();
          for (const [name, fn] of events)
            window.removeEventListener(name, fn, true);
          if (window[key] === shared) delete window[key];
        },
      };
      window[key] = shared;
    }
    shared.owners.set(owner, media);
    return () => shared.release(owner);
  }
})();
