import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'nback.theme.v1';
let stored: Map<string, string>;
let systemDark: boolean;
let root: { dataset: Record<string, string>; classList: Set<string>; offsetHeight: number };
let metas: { content: string }[];

// Theme state lives at module scope, so load a fresh copy for each test.
const loadTheme = () => import('./theme');

beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  systemDark = false;
  root = { dataset: {}, classList: new Set(), offsetHeight: 0 };
  metas = [{ content: '' }, { content: '' }];
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
    removeItem: vi.fn((key: string) => stored.delete(key)),
  });
  vi.stubGlobal('matchMedia', () => ({
    matches: systemDark,
    addEventListener: vi.fn(),
  }));
  vi.stubGlobal('document', {
    documentElement: {
      ...root,
      classList: { add: (c: string) => root.classList.add(c), remove: () => {} },
      get dataset() {
        return root.dataset;
      },
    },
    querySelectorAll: () => metas,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
});
afterEach(() => vi.unstubAllGlobals());

describe('theme preference', () => {
  it.each([null, 'blue', ''])(
    'falls back to system for a missing or unknown value: %s',
    async (value) => {
      if (value !== null) stored.set(KEY, value);
      const { getThemePreference } = await loadTheme();
      expect(getThemePreference()).toBe('system');
    },
  );

  it('follows the device in system mode', async () => {
    systemDark = true;
    const { getTheme } = await loadTheme();
    expect(getTheme()).toBe('dark');
  });

  it('overrides the device with a saved choice', async () => {
    systemDark = true;
    stored.set(KEY, 'light');
    const { getTheme } = await loadTheme();
    expect(getTheme()).toBe('light');
  });

  it('saves explicit choices, clears the key for system, and updates the page', async () => {
    const { setThemePreference } = await loadTheme();
    setThemePreference('dark');
    expect(stored.get(KEY)).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(metas.map((meta) => meta.content)).toEqual(['#111214', '#111214']);

    setThemePreference('system');
    expect(stored.has(KEY)).toBe(false);
    expect(root.dataset.theme).toBe('light');
  });

  it('toggles relative to the theme currently shown', async () => {
    systemDark = true;
    const { getTheme, toggleTheme } = await loadTheme();
    toggleTheme();
    expect(getTheme()).toBe('light');
    toggleTheme();
    expect(getTheme()).toBe('dark');
  });

  it('keeps the choice for this page view when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { getTheme, setThemePreference } = await loadTheme();
    setThemePreference('dark');
    expect(getTheme()).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
  });

  it('notifies subscribers when the theme changes', async () => {
    const { setThemePreference, subscribeTheme } = await loadTheme();
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);
    setThemePreference('dark');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setThemePreference('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
