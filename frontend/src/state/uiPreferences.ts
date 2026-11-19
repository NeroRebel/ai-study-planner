import { useSyncExternalStore } from "react";

export const UI_PREFERENCES_KEY = "ai-study-planner.ui.v1";
export interface UiPreferences {
  theme: "system" | "light" | "dark";
  contrast: "normal" | "high";
  accent: "gold" | "red" | "blue" | "green" | "violet" | "teal";
  motion: "system" | "reduced" | "full";
  density: "comfortable" | "compact";
  sidebarCollapsed: boolean;
  assistantHidden: boolean;
  calendarDensity: "compact" | "comfortable" | "wide";
  sessionMinutes: number;
  expandExplanations: boolean;
  showQuickPrompts: boolean;
}
export const defaultUiPreferences: UiPreferences = {
  theme: "system", contrast: "normal", accent: "gold", motion: "system", density: "comfortable",
  sidebarCollapsed: false, assistantHidden: false, calendarDensity: "comfortable", sessionMinutes: 60,
  expandExplanations: false, showQuickPrompts: true,
};
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function sanitizePreferences(input: unknown): UiPreferences {
  const next = { ...defaultUiPreferences };
  if (!input || typeof input !== "object") return next;
  const value = input as Record<string, unknown>;
  const choices = {
    theme: ["system", "light", "dark"], contrast: ["normal", "high"],
    accent: ["gold", "red", "blue", "green", "violet", "teal"], motion: ["system", "reduced", "full"],
    density: ["comfortable", "compact"], calendarDensity: ["compact", "comfortable", "wide"],
  } as const;
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    if ((choices[key] as readonly unknown[]).includes(value[key])) Object.assign(next, { [key]: value[key] });
  }
  for (const key of ["sidebarCollapsed", "assistantHidden", "expandExplanations", "showQuickPrompts"] as const)
    if (typeof value[key] === "boolean") next[key] = value[key];
  if (typeof value.sessionMinutes === "number" && Number.isInteger(value.sessionMinutes) && value.sessionMinutes >= 15 && value.sessionMinutes <= 240)
    next.sessionMinutes = value.sessionMinutes;
  return next;
}
export function resolveTheme(theme: UiPreferences["theme"], darkSystem: boolean) {
  return theme === "system" ? darkSystem ? "dark" : "light" : theme;
}
export function resolveReducedMotion(mode: UiPreferences["motion"], systemReduced: boolean) {
  return mode === "reduced" || (mode === "system" && systemReduced);
}
export const calendarDimensions = {
  compact: { column: 128, hour: 52 }, comfortable: { column: 164, hour: 68 }, wide: { column: 212, hour: 84 },
} as const;

export function createUiPreferencesStore(storage?: StorageLike) {
  let snapshot = { ...defaultUiPreferences }, persistenceError = false;
  const listeners = new Set<() => void>();
  try { snapshot = sanitizePreferences(JSON.parse(storage?.getItem(UI_PREFERENCES_KEY) || "null")); } catch { /* Invalid local settings are safe to reset. */ }
  function publish() { listeners.forEach(listener => listener()); }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(change: Partial<UiPreferences>) {
      snapshot = sanitizePreferences({ ...snapshot, ...change });
      try { storage?.setItem(UI_PREFERENCES_KEY, JSON.stringify(snapshot)); persistenceError = !storage; }
      catch { persistenceError = true; }
      publish();
    },
    hasPersistenceError: () => persistenceError,
    receive(value: string | null) {
      try { snapshot = sanitizePreferences(JSON.parse(value || "null")); publish(); } catch { /* Ignore malformed updates from another tab. */ }
    },
  };
}
let localStorageHandle: StorageLike | undefined;
try { localStorageHandle = globalThis.localStorage; } catch { /* Private browsing can deny storage. */ }
export const uiPreferences = createUiPreferencesStore(localStorageHandle);
export function useUiPreferences() {
  return useSyncExternalStore(uiPreferences.subscribe, uiPreferences.getSnapshot, uiPreferences.getSnapshot);
}

/** Apply before React paints; settings contain presentation choices only, never account data. */
export function applyUiPreferences(preferences: UiPreferences, darkSystem: boolean, systemReduced: boolean) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(preferences.theme, darkSystem);
  root.dataset.contrast = preferences.contrast;
  root.dataset.accent = preferences.accent;
  root.dataset.motion = resolveReducedMotion(preferences.motion, systemReduced) ? "reduced" : "full";
  root.dataset.density = preferences.density;
  root.dataset.sidebar = preferences.sidebarCollapsed ? "collapsed" : "full";
  root.style.colorScheme = root.dataset.theme;
}
export function watchUiPreferences() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)"), reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync = () => applyUiPreferences(uiPreferences.getSnapshot(), dark.matches, reduced.matches);
  const storage = (event: StorageEvent) => { if (event.key === UI_PREFERENCES_KEY) uiPreferences.receive(event.newValue); };
  sync(); const unsubscribe = uiPreferences.subscribe(sync);
  dark.addEventListener("change", sync); reduced.addEventListener("change", sync); window.addEventListener("storage", storage);
  return () => { unsubscribe(); dark.removeEventListener("change", sync); reduced.removeEventListener("change", sync); window.removeEventListener("storage", storage); };
}
