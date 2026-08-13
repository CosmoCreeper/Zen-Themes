/*
  Welcome to SuperPins!
  This file contains several patches intended to fix things that the CSS doesn't have access to.
*/

console.log("Loading SuperPins...");

// Simple api, not ready yet. Expand api to full-coverage then use.
const _prefs = {
  get(pref: string): boolean | number | string {
    const type = Services.prefs.getPrefType(pref);
    if (type === Services.prefs.PREF_BOOL) {
      return Services.prefs.getBoolPref(pref);
    }
    if (type === Services.prefs.PREF_INT) {
      return Services.prefs.getIntPref(pref);
    }
    if (type === Services.prefs.PREF_STRING) {
      return Services.prefs.getStringPref(pref);
    }
    return false;
  },
  bool(pref: string, fallback = false): boolean {
    try {
      return Services.prefs.getBoolPref(pref);
    } catch {
      return fallback;
    }
  },
};

abstract class MutationListener {
  #observer = null as MutationObserver | null;

  constructor(
    options: MutationObserverInit & { translate?: boolean },
    ...targets: Node[]
  ) {
    if (targets.length === 0) {
      console.warn("[SuperPins]!: MutationListener created with no targets.");
    }
    this.#observer = new MutationObserver(
      options.translate
        ? this.translateRecord.bind(this)
        : this.callback.bind(this)
    );
    for (const target of targets) {
      this.#observer.observe(target, options);
    }
  }

  translateRecord(records: MutationRecord[]) {
    const elements = [] as HTMLElement[];
    for (const record of records) {
      if (
        record.type === "attributes" &&
        record.target instanceof HTMLElement
      ) {
        elements.push(record.target);
      }
    }
    this.callback(elements);
  }

  abstract callback(elements: MutationRecord[] | HTMLElement[]): void;

  disconnect() {
    if (this.#observer) {
      this.#observer.disconnect();
    }
  }
}

/*
 * Removes the orient attribute from pinned tabs containers.
 * XUL box layout fights SuperPins' CSS grid/flex-wrap, especially after the
 * sidebar is hidden and shown again.
 */
class OrientListener extends MutationListener {
  prefs = ["uc.pins.legacy-layout", "uc.pins.auto-grow"];

  constructor(prefListeners: Record<string, () => void>) {
    // spread operator is not fast, alternative?
    super(
      { attributes: true, translate: true },
      ...document.querySelectorAll<HTMLElement>(
        ".zen-workspace-pinned-tabs-section"
      )
    );

    for (const pref of this.prefs) {
      prefListeners[pref] = this.update.bind(this);
    }
    this.update();

    this.callback([
      ...document.querySelectorAll<HTMLElement>(
        ".zen-workspace-pinned-tabs-section"
      ),
    ]);
  }

  needsOrientPatch() {
    return this.prefs.some((pref) => _prefs.bool(pref));
  }

  update() {
    if (!this.needsOrientPatch()) {
      this.disconnect();
      console.log(
        "[SuperPins]: Grid/auto-grow disabled, orientation patch disconnected."
      );
    }
  }

  callback(pinnedTabsContainers: HTMLElement[]) {
    if (!this.needsOrientPatch()) {
      return;
    }
    for (const pinnedTabsContainer of pinnedTabsContainers) {
      if (pinnedTabsContainer.hasAttribute("orient")) {
        console.log("[SuperPins]: Orientation attribute found, removing...");
        pinnedTabsContainer.removeAttribute("orient");
        console.log("  > Successfully removed attribute.");
      }
    }
  }
}

/*
 * When the sidebar is hidden/collapsed and opened again, the pin grid can keep
 * a 0-height from the hidden pass. Force a reflow so normal tabs sit below
 * SuperPins instead of covering them.
 */
class SidebarRelayoutListener {
  #timer = 0;
  #mutationObserver: MutationObserver | null = null;

  constructor() {
    const root = document.documentElement;
    const toolbox = document.getElementById("navigator-toolbox");

    this.#mutationObserver = new MutationObserver(() => this.schedule());
    this.#mutationObserver.observe(root, {
      attributes: true,
      attributeFilter: [
        "zen-sidebar-expanded",
        "zen-compact-mode",
        "zen-has-hover",
      ],
    });
    if (toolbox) {
      this.#mutationObserver.observe(toolbox, {
        attributes: true,
        attributeFilter: [
          "zen-sidebar-expanded",
          "zen-has-hover",
          "zen-user-show",
          "animate",
        ],
      });
    }
  }

  schedule() {
    window.clearTimeout(this.#timer);
    this.stripOrient();
    this.#timer = window.setTimeout(() => this.relayout(), 300);
  }

  stripOrient() {
    for (const section of document.querySelectorAll<HTMLElement>(
      ".zen-workspace-pinned-tabs-section"
    )) {
      if (section.hasAttribute("orient")) {
        section.removeAttribute("orient");
      }
    }
  }

  relayout() {
    this.stripOrient();

    for (const section of document.querySelectorAll<HTMLElement>(
      ".zen-workspace-pinned-tabs-section"
    )) {
      // Force grid/flex to recompute at the current sidebar width. A hidden
      // pass can leave auto-fit tracks collapsed at 0 height.
      const display = section.style.display;
      section.style.display = "none";
      void section.offsetHeight;
      if (display) {
        section.style.display = display;
      } else {
        section.style.removeProperty("display");
      }
    }

    for (const workspace of document.querySelectorAll("zen-workspace")) {
      const scrollbox = (
        workspace as {
          scrollbox?: { _updateScrollButtonsDisabledState?: () => void };
        }
      ).scrollbox;
      scrollbox?._updateScrollButtonsDisabledState?.();
    }
  }

  disconnect() {
    this.#mutationObserver?.disconnect();
    window.clearTimeout(this.#timer);
  }
}

class Tweaks {
  #prefListeners: Record<string, () => void> = {};
  #mutationListeners: Array<MutationListener | SidebarRelayoutListener> = [
    new OrientListener(this.#prefListeners),
    new SidebarRelayoutListener(),
  ];

  constructor() {
    // Attach pref listeners
    for (const pref of Object.keys(this.#prefListeners)) {
      Services.prefs.addObserver(pref, this);
    }

    // Unload pref listeners on DOM unload
    window.addEventListener("beforeunload", this);

    // Unload script effects when unloaded by Sine
    window.addUnloadListener(this.unload.bind(this));
  }

  observe(_: unknown, topic: string, pref: string) {
    if (
      topic === "nsPref:changed" &&
      Object.hasOwn(this.#prefListeners, pref)
    ) {
      this.#prefListeners[pref]!();
    }
  }

  handleEvent(event: BeforeUnloadEvent) {
    if (event.type === "beforeunload") {
      this.unload();
    }
  }

  // Unload tweaks
  unload() {
    // Unload pref observers
    for (const pref of Object.keys(this.#prefListeners)) {
      Services.prefs.removeObserver(pref, this);
    }

    // TODO: Unload the rest
    for (const listener of this.#mutationListeners) {
      listener.disconnect();
    }
  }
}

new Tweaks();
