// stats.js — Cards by state, accuracy, streak, settings

const Stats = (() => {

  function render() {
    const el = document.getElementById('screen-stats');
    const counts = Data.getStateCounts();
    const total = Data.totalChars();
    const streak = Storage.getProgress().streak || { current: 0, longest: 0 };
    const settings = Storage.getSettings();

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
        <h2>Last 7 Days</h2>
        <div style="display:flex; gap:4px; align-items:flex-end; height:100px;">
          ${dailyData.map(d => `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
              <div style="width:100%; background:var(--accent); border-radius:4px 4px 0 0;
                          height:${Math.max(2, (d.reviews / maxReviews) * 80)}px;
                          opacity:${d.reviews > 0 ? 1 : 0.2};"></div>
              <span style="font-size:10px; color:var(--text-muted);">${d.date.slice(8)}</span>
            </div>
          `).join('')}
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
        <h2>Settings</h2>
        <div class="settings-group">
          <div class="settings-row">
            <label>New cards per day</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="range" id="setting-new-per-day" min="5" max="20" step="1" value="${settings.newPerDay}">
              <span id="new-per-day-val" style="font-size:14px; font-weight:600; min-width:24px;">${settings.newPerDay}</span>
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
        <h2>Data</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" id="btn-export">Export Progress</button>
          <button class="btn-secondary" id="btn-import">Import Progress</button>
        </div>
        <input type="file" id="import-file" accept=".json" style="display:none;">
      </div>
    `;

    // Event listeners
    document.getElementById('setting-new-per-day').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('new-per-day-val').textContent = val;
      Storage.updateSettings({ newPerDay: val });
    });

    document.getElementById('setting-theme').addEventListener('change', (e) => {
      Storage.updateSettings({ theme: e.target.value });
      App.applyTheme(e.target.value);
    });

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

  return { render };
})();
