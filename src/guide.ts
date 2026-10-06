import { getTheme, initTheme, subscribeTheme, toggleTheme } from './theme';

const toggles = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');
const sync = () =>
  toggles.forEach((button) => button.setAttribute('aria-pressed', String(getTheme() === 'dark')));
toggles.forEach((button) => button.addEventListener('click', toggleTheme));
subscribeTheme(sync);
initTheme();
