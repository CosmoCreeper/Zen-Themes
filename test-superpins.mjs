// Run after `bun run build`: node --test test-superpins.mjs
// These exercise the shipped module's input/lifecycle behavior. Layout itself
// requires Zen/Gecko; see SuperPins/SCROLLING-VERIFICATION.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const modulePath =
  process.env.SUPERPINS_MODULE ??
  new URL("SuperPins/dist/section-scrolling.uc.mjs", import.meta.url);
const source = () => readFileSync(modulePath, "utf8");

function fixture() {
  const events = new Map();
  const frames = new Map();
  const styles = new Set();
  const unloads = [];
  const media = { matches: true };
  let frameId = 0;
  const pane = {
    isConnected: true,
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 200,
    getBoundingClientRect: () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 200,
      height: 200,
    }),
    contains: (node) => node === pane,
  };
  const tab = {
    isConnected: true,
    revealed: 0,
    closest: () => tab,
    getBoundingClientRect: () => ({ height: 36 }),
    scrollIntoView(options) {
      assert.equal(options.block, "nearest");
      assert.equal(options.behavior, "instant");
      this.revealed++;
    },
  };
  const win = {
    addEventListener(name, fn) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(fn);
    },
    removeEventListener: (name, fn) => events.get(name)?.delete(fn),
    addUnloadListener: (fn) => unloads.push(fn),
    matchMedia(query) {
      assert.match(query, /uc\.pins\.stay-at-top/);
      assert.match(query, /zen\.tabs\.vertical/);
      return media;
    },
  };
  const context = vm.createContext({
    window: win,
    document: {
      createElementNS: () => ({
        remove() {
          styles.delete(this);
        },
      }),
      documentElement: { appendChild: (style) => styles.add(style) },
    },
    gBrowser: { selectedTab: tab },
    requestAnimationFrame: (fn) => {
      frames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const load = () => vm.runInContext(source(), context);
  const fire = (name, extra = {}) => {
    for (const fn of events.get(name) ?? []) fn({ type: name, ...extra });
  };
  const frame = (now = 16) => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(now));
  };
  const drag = (y = 195) =>
    fire("dragover", {
      target: { closest: () => pane },
      dataTransfer: { types: ["application/x-moz-tabbrowser-tab"] },
      clientX: 100,
      clientY: y,
    });
  return {
    win,
    media,
    pane,
    tab,
    styles,
    events,
    frames,
    unloads,
    load,
    fire,
    frame,
    drag,
  };
}

test("Sine registers both scripts and preserves the orientation patch", () => {
  const theme = JSON.parse(
    readFileSync(new URL("SuperPins/theme.json", import.meta.url))
  );
  assert.deepEqual(theme.scripts["dist/patches.uc.mjs"].include, [
    "chrome://browser/content/browser.xhtml",
  ]);
  assert.deepEqual(theme.scripts["dist/section-scrolling.uc.mjs"].include, [
    "chrome://browser/content/browser.xhtml",
  ]);
  assert.equal(theme.supportsUnload, true);
});

test("author style shrinks the shadow slot without touching Essentials", () => {
  const f = fixture();
  f.load();
  assert.equal(f.styles.size, 1);
  const css = [...f.styles][0].textContent;
  assert.match(css, /::part\(items-wrapper\)/);
  assert.match(css, /min-height:\s*0\s*!important/);
  assert.doesNotMatch(css, /essentials/i);
});

test("selection, focus and resize reveal native tabs only while enabled", () => {
  const f = fixture();
  f.load();
  f.fire("TabSelect");
  f.frame();
  f.fire("focusin", { target: f.tab });
  f.frame();
  f.fire("resize");
  f.frame();
  assert.equal(f.tab.revealed, 3);
  f.media.matches = false;
  f.fire("TabSelect");
  f.frame();
  assert.equal(f.tab.revealed, 3);
});

test("pending reveal checks current preference and connection state", () => {
  const f = fixture();
  f.load();
  f.fire("TabSelect");
  f.media.matches = false;
  f.frame();
  assert.equal(f.tab.revealed, 0);
  f.media.matches = true;
  f.fire("TabSelect");
  f.tab.isConnected = false;
  f.frame();
  assert.equal(f.tab.revealed, 0);
});

test("pinned drag scroll continues between dragover events and stops centrally", () => {
  const f = fixture();
  f.load();
  f.drag();
  f.frame();
  const initial = f.pane.scrollTop;
  f.frame(32);
  assert.ok(f.pane.scrollTop > initial);
  f.drag(100);
  const stopped = f.pane.scrollTop;
  f.frame(48);
  assert.equal(f.pane.scrollTop, stopped);
  assert.equal(f.frames.size, 0);
});

for (const event of ["drop", "dragend", "blur", "dragleave"]) {
  test(`${event} stops pending drag scroll`, () => {
    const f = fixture();
    f.load();
    f.drag();
    f.fire(event, { relatedTarget: null });
    f.frame();
    assert.equal(f.pane.scrollTop, 0);
    assert.equal(f.frames.size, 0);
  });
}

test("preference changes stop an ongoing drag", () => {
  const f = fixture();
  f.load();
  f.drag();
  f.frame();
  const previous = f.pane.scrollTop;
  f.media.matches = false;
  f.frame(32);
  assert.equal(f.pane.scrollTop, previous);
  assert.equal(f.frames.size, 0);
});

test("reload and Sine unload leave no duplicate handlers, styles or frames", () => {
  const f = fixture();
  f.load();
  f.load();
  assert.equal(f.styles.size, 1);
  for (const listeners of f.events.values()) assert.equal(listeners.size, 1);
  f.drag();
  f.fire("TabSelect");
  f.unloads.at(-1)();
  assert.equal(f.styles.size, 0);
  assert.equal(f.frames.size, 0);
  for (const listeners of f.events.values()) assert.equal(listeners.size, 0);
  assert.equal(f.win.__zenSectionScrollRepair, undefined);
  assert.equal(f.win.__superPinsSlotSizing, undefined);
});

test("another mod owner keeps shared input handlers alive after SuperPins unload", () => {
  const f = fixture();
  f.load();
  const shared = f.win.__zenSectionScrollRepair;
  const other = {};
  shared.owners.set(other, { matches: true });
  f.unloads[0]();
  assert.equal(f.styles.size, 0);
  f.fire("TabSelect");
  f.frame();
  assert.equal(f.tab.revealed, 1);
  shared.release(other);
  assert.equal(f.win.__zenSectionScrollRepair, undefined);
  for (const listeners of f.events.values()) assert.equal(listeners.size, 0);
});
