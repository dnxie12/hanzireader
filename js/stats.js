// stats.js — Cards by state, accuracy, streak, settings

const Stats = (() => {

  function render() {
    const el = document.getElementById('screen-stats');
    const counts = Data.getStateCounts();
    const total = Data.totalChars();
    const streak = Storage.getProgress().streak || { current: 0, longest: 0 };
    const settings = Storage.getSettings();
    const hskCounts = Data.getHSKCounts();

    // Get last 7 days of review data
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const stats = Storage.getDailyStats(date);
      dailyData.push({ date, ...stats });
    }

    const maxReviews = Math.max(...dailyData.map(d => d.reviews), 1);

    el.innerHTML = `
      <div class="stats-section">
        <h2>Card States</h2>
        <div class="state-bars">
          ${stateBar('New', counts.new, total, 'var(--state-new)')}
          ${stateBar('Learning', counts.learning, total, 'var(--state-learning)')}
          ${stateBar('Known', counts.review, total, 'var(--state-review)')}
          ${stateBar('Relearning', counts.relearning, total, 'var(--state-relearning)')}
        </div>
      </div>

      <div class="stats-section">
        <h2>HSK Progress</h2>
        <div class="state-bars">
          ${renderHSKBars(hskCounts)}
        </div>
      </div>

      <div class="stats-section">
        <h2>Last 7 Days</h2>
        <div style="display:flex; gap:4px; align-items:flex-end; height:100px;">
          ${dailyData.map(d => {
            const snippets = d.snippetsRead || 0;
            const totalActivity = d.reviews + snippets;
            const maxTotal = Math.max(...dailyData.map(x => x.reviews + (x.snippetsRead || 0)), 1);
            const reviewH = totalActivity > 0 ? Math.max(2, (d.reviews / maxTotal) * 80) : 2;
            const readH = snippets > 0 ? Math.max(2, (snippets / maxTotal) * 80) : 0;
            return `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <div style="width:100%; display:flex; flex-direction:column-reverse;">
                <div style="width:100%; background:var(--accent); border-radius:${readH > 0 ? '0' : '4px 4px'} 0 0;
                            height:${reviewH}px;
                            opacity:${d.reviews > 0 ? 1 : 0.2};"></div>
                ${readH > 0 ? `<div style="width:100%; background:var(--state-review); border-radius:4px 4px 0 0;
                            height:${readH}px;"></div>` : ''}
              </div>
              <span style="font-size:10px; color:var(--text-muted);">${d.date.slice(8)}</span>
            </div>
          `}).join('')}
        </div>
        <div style="display:flex; gap:12px; margin-top:8px; font-size:11px; color:var(--text-muted);">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--accent);vertical-align:middle;margin-right:4px;"></span>Reviews</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--state-review);vertical-align:middle;margin-right:4px;"></span>Reading</span>
        </div>
      </div>

      <div class="stats-section">
        <h2>Streak</h2>
        <div class="stat-cards">
          <div class="stat-card">
            <div class="stat-value">${streak.current}</div>
            <div class="stat-label">Current</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${streak.longest}</div>
            <div class="stat-label">Longest</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Data.getLiteracyPercent()}%</div>
            <div class="stat-label">Literacy</div>
          </div>
        </div>
      </div>

      <div class="stats-section">
        <h2>Reading</h2>
        <div class="stat-cards">
          <div class="stat-card">
            <div class="stat-value">${dailyData.reduce((sum, d) => sum + (d.snippetsRead || 0), 0)}</div>
            <div class="stat-label">Passages (7d)</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Object.keys(Storage.getReadHistory()).length}</div>
            <div class="stat-label">Total Read</div>
          </div>
        </div>
      </div>

      <div class="stats-section">
        <h2>Settings</h2>
        <div class="settings-group">
          <div class="settings-row">
            <label>New cards per day</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="range" id="setting-new-per-day" min="5" max="50" step="1" value="${settings.newPerDay}">
              <span id="new-per-day-val" style="font-size:14px; font-weight:600; min-width:24px;">${settings.newPerDay}</span>
            </div>
          </div>
          <div class="settings-row">
            <label>Audio</label>
            <div class="read-toggle" id="audio-toggle-wrap">
              <button class="read-toggle-switch" id="setting-audio" role="switch" aria-checked="${settings.audioEnabled !== false}" aria-label="Audio"></button>
            </div>
          </div>
          <div class="settings-row">
            <label>Theme</label>
            <select id="setting-theme" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary);">
              <option value="system" ${settings.theme === 'system' ? 'selected' : ''}>System</option>
              <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
          </div>
        </div>
      </div>

      <div class="stats-section">
        <h2>Cloud Sync</h2>
        ${Sync.getUser() ? `
          <div class="settings-group">
            <div class="settings-row">
              <label>Signed in as</label>
              <span style="font-size:14px;">${UI.esc(Sync.getUser().displayName || Sync.getUser().email || 'Google User')}</span>
            </div>
            <div class="settings-row">
              <label>Last synced</label>
              <span style="font-size:14px;">${settings.lastSyncTime ? new Date(settings.lastSyncTime).toLocaleString() : 'Never'}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="btn-secondary" id="btn-sync-now">Sync Now</button>
            <button class="btn-secondary" id="btn-sync-signout">Sign Out</button>
          </div>
        ` : `
          <p style="font-size:14px; color:var(--text-secondary); margin-bottom:8px;">Sync your progress across devices with Google sign-in.</p>
          <button class="btn-secondary" id="btn-sync-signin">Sign In with Google</button>
        `}
      </div>

      <div class="stats-section">
        <h2>Data</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" id="btn-export">Export Progress</button>
          <button class="btn-secondary" id="btn-import">Import Progress</button>
        </div>
        <input type="file" id="import-file" accept=".json" style="display:none;">
      </div>

      <div style="text-align:center; padding:1rem 0 0.5rem; font-size:13px;">
        <a href="https://github.com/dnxie12/hanzireader" target="_blank" rel="noopener" style="color:var(--text-muted); text-decoration:none;">GitHub</a>
        <span style="color:var(--text-muted); margin:0 6px;">·</span>
        <a href="privacy.html" target="_blank" rel="noopener" style="color:var(--text-muted); text-decoration:none;">Privacy</a>
      </div>
    `;

    // Event listeners
    document.getElementById('setting-new-per-day').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('new-per-day-val').textContent = val;
      Storage.updateSettings({ newPerDay: val });
    });

    document.getElementById('audio-toggle-wrap').addEventListener('click', () => {
      const btn = document.getElementById('setting-audio');
      const isOn = btn.getAttribute('aria-checked') === 'true';
      btn.setAttribute('aria-checked', !isOn);
      if (typeof Audio_ !== 'undefined') Audio_.setEnabled(!isOn);
    });

    document.getElementById('setting-theme').addEventListener('change', (e) => {
      Storage.updateSettings({ theme: e.target.value });
      App.applyTheme(e.target.value);
    });

    // Sync event listeners
    const signInBtn = document.getElementById('btn-sync-signin');
    if (signInBtn) {
      signInBtn.addEventListener('click', async () => {
        signInBtn.disabled = true;
        signInBtn.textContent = 'Signing in…';
        try {
          const u = await Sync.signIn();
          if (u) {
            UI.toast('Signed in and synced');
            Stats.render();
          }
        } catch (e) {
          console.warn('Sign-in failed:', e);
          UI.toast('Sign-in failed');
          signInBtn.disabled = false;
          signInBtn.textContent = 'Sign In with Google';
        }
      });
    }
    const syncNowBtn = document.getElementById('btn-sync-now');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        try {
          await Sync.syncNow();
          UI.toast('Synced');
          Stats.render();
        } catch (e) {
          console.warn('Sync failed:', e);
          UI.toast('Sync failed');
        }
      });
    }
    const signOutBtn = document.getElementById('btn-sync-signout');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        try {
          await Sync.signOut();
          UI.toast('Signed out');
          Stats.render();
        } catch (e) {
          console.warn('Sign-out failed:', e);
          UI.toast('Sign-out failed');
        }
      });
    }

    document.getElementById('btn-export').addEventListener('click', () => {
      const data = Storage.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hanzi-reader-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Progress exported');
    });

    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Storage.importData(reader.result);
          UI.toast('Progress imported');
          Stats.render(); // Refresh
        } catch {
          UI.toast('Invalid backup file');
        }
      };
      reader.readAsText(file);
    });
  }

  function stateBar(label, count, total, color) {
    const pct = total > 0 ? (count / total * 100) : 0;
    return `
      <div class="state-bar-row">
        <span class="state-bar-label">${label}</span>
        <div class="state-bar-track">
          <div class="state-bar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
        <span class="state-bar-count">${count}</span>
      </div>
    `;
  }

  const HSK_COLORS = {
    1: 'var(--accent)',
    2: 'var(--tone-2)',
    3: 'var(--tone-3)',
    4: 'var(--tone-4)',
    5: '#6366F1',
    6: '#EC4899',
    0: 'var(--text-muted)',
  };

  function renderHSKBars(hskCounts) {
    const levels = Object.keys(hskCounts).map(Number).sort((a, b) => a - b);
    if (levels[0] === 0) levels.push(levels.shift());
    return levels.map(level => {
      const data = hskCounts[level];
      const label = level === 0 ? 'Beyond HSK' : 'HSK ' + level;
      const color = HSK_COLORS[level] || 'var(--text-muted)';
      return hskBar(label, data.known, data.total, color);
    }).join('');
  }

  function hskBar(label, known, total, color) {
    const pct = total > 0 ? (known / total * 100) : 0;
    return `
      <div class="state-bar-row">
        <span class="state-bar-label">${label}</span>
        <div class="state-bar-track">
          <div class="state-bar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
        <span class="state-bar-count" style="width:auto;min-width:40px;">${known}/${total}</span>
      </div>
    `;
  }

  // Re-render stats when Firebase auth state is restored after page load
  Sync.onAuthChange(() => {
    const statsScreen = document.getElementById('screen-stats');
    if (statsScreen && statsScreen.offsetParent !== null) {
      render();
    }
  });

  return { render };
})();
