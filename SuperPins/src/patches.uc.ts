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
 * This will allow the auto-grow feature to work properly.
 */
class OrientListener extends MutationListener {
  pref = "uc.pins.auto-grow";

  constructor(prefListeners: Record<string, () => void>) {
    super(
      { attributes: true, translate: true },
      ...document.querySelectorAll<HTMLElement>(
        ".zen-workspace-pinned-tabs-section"
      )
    );

    prefListeners[this.pref] = this.update.bind(this);
    this.update();

    this.callback([
      ...document.querySelectorAll<HTMLElement>(
        ".zen-workspace-pinned-tabs-section"
      ),
    ]);
  }

  // Adaptive update function, currently using a static one unless the dynamic one is added to the parent class
  /*   update() {
    if (prefs.get(this.on.pref) !== this.on.is) {
      this.disconnect();
      console.log("[SuperPins]: Auto-grow disabled, orientation patch disconnected.");
    }
  } */

  update() {
    if (!Services.prefs.getBoolPref(this.pref)) {
      this.disconnect();
      console.log(
        "[SuperPins]: Auto-grow disabled, orientation patch disconnected."
      );
    }
  }

  callback(pinnedTabsContainers: HTMLElement[]) {
    for (const pinnedTabsContainer of pinnedTabsContainers) {
      if (pinnedTabsContainer.hasAttribute("orient")) {
        console.log("[SuperPins]: Orientation attribute found, removing...");
        pinnedTabsContainer.removeAttribute("orient");
        console.log("  > Successfully removed attribute.");
      }
    }
  }
}

class Tweaks {
  #prefListeners: Record<string, () => void> = {};
  #mutationListeners: MutationListener[] = [
    new OrientListener(this.#prefListeners),
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
