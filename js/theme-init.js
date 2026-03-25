// theme-init.js — Apply theme before first paint to prevent FOUC
// Loaded synchronously in <head>, before CSS paints. Keeps page hidden
// via html.not-ready until app.js finishes init and removes the class.
try {
  const settings = JSON.parse(localStorage.getItem('hanzi_progress') || '{}').settings;
  const theme = settings && settings.theme;
  if (theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch (e) { /* best-effort; app.js applyTheme() handles fallback */ }
