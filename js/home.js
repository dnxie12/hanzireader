// home.js — Home screen: streak, literacy %, forecast, CTA

const Home = (() => {

  function render() {
    const dashboard = document.getElementById('home-dashboard');
    if (!dashboard) return;

    const isReturning = Storage.getSettings().placementDone === true;
    const streak = Storage.getProgress().streak || { current: 0, longest: 0 };
    const literacy = Data.getLiteracyPercent();
    const counts = Data.getStateCounts();
    const dueCount = SRS.getDueCards().length;
    const todayStats = Storage.getDailyStats();

    // Hide marketing sections for returning users — keep in DOM for SEO crawlers
    if (isReturning) {
      const el = document.getElementById('screen-home');
      el.querySelectorAll('.home-section').forEach(s => s.hidden = true);
      const header = el.querySelector('.home-header');
      if (header) {
        const eyebrow = header.querySelector('.eyebrow');
        const lead = header.querySelector('.home-lead');
        if (eyebrow) eyebrow.hidden = true;
        if (lead) lead.hidden = true;
      }
      const trustList = el.querySelector('.home-trust-list');
      if (trustList) trustList.hidden = true;
    }

    dashboard.innerHTML = `
      <section class="home-dashboard-card">
        <div class="home-dashboard-header">
          <h2>Your Reading Dashboard</h2>
          <p>Track literacy growth and decide whether to review or read next.</p>
        </div>
        <div class="literacy-bar">
          <div class="literacy-bar-fill" style="width: ${literacy}%"></div>
          <div class="literacy-bar-label">${literacy}% Literacy</div>
        </div>
        <div class="stat-cards">
          <div class="stat-card">
            <div class="stat-value">${streak.current}</div>
            <div class="stat-label">Day Streak</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${dueCount}</div>
            <div class="stat-label">Due Today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${counts.review}</div>
            <div class="stat-label">Known</div>
          </div>
        </div>

        ${todayStats.reviews > 0 || todayStats.snippetsRead > 0 ? `
        <div class="stat-cards" style="margin-top: 8px;">
          <div class="stat-card">
            <div class="stat-value">${todayStats.reviews}</div>
            <div class="stat-label">Reviewed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${todayStats.newCards}</div>
            <div class="stat-label">New Today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${todayStats.reviews > 0 ? Math.round(todayStats.correct / todayStats.reviews * 100) : 0}%</div>
            <div class="stat-label">Accuracy</div>
          </div>
          ${todayStats.snippetsRead > 0 ? `
          <div class="stat-card">
            <div class="stat-value">${todayStats.snippetsRead}</div>
            <div class="stat-label">Read Today</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
      </section>
    `;

    const studyBtn = document.getElementById('home-study-btn');
    if (studyBtn) {
      studyBtn.textContent = dueCount > 0 ? `Study Now (${dueCount} due)` : 'Start Learning';
    }
  }

  return { render };
})();
