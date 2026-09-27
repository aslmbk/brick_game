// Glue between the browser and the pure game: one device, a rAF loop that runs
// only while time matters, input listeners, sounds and saving the settings.
import { create } from "zustand";
import * as device from "./device.js";
import { play, unlockAudio } from "./sfx.js";

let storage = null;
try {
  storage = window.localStorage;
} catch {
  // storage blocked (privacy mode, sandbox): settings last for this visit only
}

const dev = device.createDevice(device.loadPrefs(storage));
let saved = dev.prefs;
let raf = 0;
let last = 0;

export const useGame = create(() => ({ view: device.view(dev, null) }));

export function press(input, source) {
  unlockAudio();
  apply(input, source);
}

export function release(source) {
  device.release(dev, source);
  sync();
}

export function bindInput() {
  const onKeyDown = (e) => {
    const input = device.KEYMAP[e.code];
    if (!input || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) press(input, e.code);
  };
  const onKeyUp = (e) => {
    if (device.KEYMAP[e.code]) release(e.code);
  };
  const onPointerUp = (e) => release("p" + e.pointerId);
  const onHide = () => apply("hide");
  const onVisibility = () => {
    if (document.hidden) onHide();
  };
  const onPageHide = () => {
    if (dev.prefs !== saved) save();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("blur", onHide);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("blur", onHide);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    device.releaseAll(dev);
    sync();
  };
}

function apply(input, source) {
  device.press(dev, input, source);
  sync();
}

function sync() {
  const prev = useGame.getState().view;
  const view = device.view(dev, prev);
  if (view !== prev) useGame.setState({ view });
  if (dev.events.length) {
    if (dev.prefs.sound) dev.events.forEach(play);
    dev.events.length = 0;
  }
  // During play the record grows with every point: save when play stops instead.
  if (dev.prefs !== saved && dev.mode !== "play") save();
  if (!raf && device.needsTime(dev)) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(now) {
  device.step(dev, Math.min(100, Math.max(0, now - last)));
  last = now;
  raf = device.needsTime(dev) ? requestAnimationFrame(frame) : 0;
  sync();
}

function save() {
  saved = dev.prefs;
  device.savePrefs(storage, saved);
}

if (import.meta.hot) import.meta.hot.dispose(() => cancelAnimationFrame(raf));
