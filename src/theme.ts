// The inline script in each page's <head> applies the saved theme before first
// paint; keep its storage key and colors in sync with this module.
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'nback.theme.v1';
const BROWSER_COLORS: Record<Theme, string> = { light: '#fcfcfb', dark: '#111214' };
const listeners = new Set<() => void>();
// Keeps the choice for this page view if storage is unavailable.
let current: ThemePreference | null = null;
let initialized = false;

const systemDark = () => matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference(): ThemePreference {
  if (current) return current;
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function getTheme(): Theme {
  const preference = getThemePreference();
  if (preference !== 'system') return preference;
  return systemDark().matches ? 'dark' : 'light';
}

function applyTheme() {
  const root = document.documentElement;
  const theme = getTheme();
  if (root.dataset.theme !== theme) {
    // Switch every color in one frame instead of letting button transitions
    // lag behind the page.
    root.classList.add('theme-switching');
    root.dataset.theme = theme;
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove('theme-switching'));
  }
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => (meta.content = BROWSER_COLORS[theme]));
  listeners.forEach((listener) => listener());
}

export function setThemePreference(preference: ThemePreference) {
  current = preference;
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // The theme still applies to this page view.
  }
  applyTheme();
}

export function toggleTheme() {
  setThemePreference(getTheme() === 'dark' ? 'light' : 'dark');
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Follows OS changes in system mode and theme changes made in other tabs. */
export function initTheme() {
  if (initialized) return;
  initialized = true;
  systemDark().addEventListener('change', applyTheme);
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    current = null;
    applyTheme();
  });
  applyTheme();
}
