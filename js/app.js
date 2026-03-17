// app.js — Router, tab switching, theme management, init

const App = (() => {
  const screens = ['home', 'read', 'study', 'browse', 'stats'];
  let currentScreen = 'home';

  function init() {
    SRS.init();
    applyTheme(Storage.getSettings().theme);
    Sync.init();

    // Show placement test on first launch
    if (Placement.shouldShow()) {
      Placement.start();
      return;
    }

    setupRouting();
    setupTabs();

    // Navigate to hash or default to home
    const hash = window.location.hash.slice(1) || 'home';
    navigate(screens.includes(hash) ? hash : 'home');
  }

  function finishInit() {
    setupRouting();
    setupTabs();
    navigate('home');
  }

  function setupRouting() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1);
      if (screens.includes(hash) && hash !== currentScreen) {
        navigate(hash);
      }
    });
  }

  function setupTabs() {
    document.querySelector('.tab-bar')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      navigate(tab.dataset.screen);
    });
  }

  function navigate(screen) {
    if (!screens.includes(screen)) return;

    currentScreen = screen;
    window.location.hash = screen;

    // Update screen visibility
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const screenEl = document.getElementById(`screen-${screen}`);
    if (screenEl) screenEl.classList.add('active');

    // Update tab bar
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.screen === screen);
    });

    // Render screen content
    switch (screen) {
      case 'home': Home.render(); break;
      case 'read': Read.render(); break;
      case 'study': Study.render(); break;
      case 'browse': Browse.render(); break;
      case 'stats': Stats.render(); break;
    }
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (Storage.getSettings().theme === 'system') {
      applyTheme('system');
    }
  });

  return { init, finishInit, navigate, applyTheme };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
