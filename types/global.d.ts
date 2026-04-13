interface Window {
  addUnloadListener(callback: () => void): void;
}

declare const Services: {
  prefs: {
    addObserver(pref: string, observer: object): void;
    removeObserver(pref: string, observer: object): void;

    getPrefType(pref: string): number;

    PREF_INVALID: 0;
    PREF_STRING: 32;
    PREF_INT: 64;
    PREF_BOOL: 128;

    getBoolPref(pref: string): boolean;
    getIntPref(pref: string): number;
    getStringPref(pref: string): string;
  };
};

declare const gZenWorkspaces: {
  pinnedTabsContainer: HTMLElement;
};
