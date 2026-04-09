/*
  Welcome to SuperPins!
  This file contains several patches intended to fix things that the CSS doesn't have access to.
*/

// Tweaks to make TypeScript understand the Mozilla DOM interfaces
declare global {
  interface Window {
    // API that Sine provides to perform actions on script unload
    addUnloadListener(callback: () => void): void;
  }

  const Services: {
    prefs: {
      // Manages listeners that listen for changes to the pref specified
      addObserver(pref: string, observer: object): void;
      removeObserver(pref: string, observer: object): void;

      // Returns the value of a specified pref, different API for each pref type
      getBoolPref(pref: string): boolean;
      getIntPref(pref: string): number;
      getStringPref(pref: string): string;
    };
  };

  const gZenWorkspaces: {
    // Returns the current pinned tabs container for the current workspace
    pinnedTabsContainer: HTMLElement;
  };
}

console.log("Loading SuperPins...");

class Tweaks {
  #prefListeners: Record<string, () => void> = {};

  constructor() {
    // Apply immediate patches
    this.removeOrientAttr();

    // Attach pref listeners
    for (const pref of Object.keys(this.#prefListeners)) {
      Services.prefs.addObserver(pref, this);
    }

    // Unload pref listeners on DOM unload
    window.addEventListener("beforeunload", this);

    // Unload script effects when unloaded by Sine
    window.addUnloadListener(this.unload.bind(this));
  }

  observe(_: Window, topic: string, pref: string) {
    if (topic === "nsPref:changed" && Object.hasOwn(this.#prefListeners, pref)) {
      this.#prefListeners[pref]!();
    }
  }

  handleEvent(event: BeforeUnloadEvent) {
    if (event.type === "beforeunload") {
      this.unload();
    }
  }

  // Patches and callbacks, main logic

  /*
    Remove orient attribute from the starting pinned tabs container.
    This will allow the pinned tabs auto-grow feature to work properly.
  */
  removeOrientAttr() {
    gZenWorkspaces.pinnedTabsContainer.removeAttribute("orient");
  }

  // Unload tweaks
  unload() {
    // Unload pref observers
    for (const pref of Object.keys(this.#prefListeners)) {
      Services.prefs.removeObserver(pref, this);
    }

    // TODO: Unload the rest
  }
}

new Tweaks();
