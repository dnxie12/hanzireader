// home.js — Home screen: streak, literacy %, forecast, CTA

const Home = (() => {

  function render() {
    const el = document.getElementById('screen-home');
    const streak = Storage.getProgress().streak || { current: 0, longest: 0 };
    const literacy = Data.getLiteracyPercent();
    const counts = Data.getStateCounts();
    const dueCount = SRS.getDueCards().length;
    const todayStats = Storage.getDailyStats();

    el.innerHTML = `
      <div class="home-header">
        <h1>Hanzi Reader</h1>
        <p>Character recognition for heritage speakers</p>
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

      <button class="btn-primary" id="home-study-btn">
        ${dueCount > 0 ? `Study Now (${dueCount} due)` : 'Start Learning'}
      </button>

      ${todayStats.reviews > 0 ? `
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
      </div>
      ` : ''}
    `;

    document.getElementById('home-study-btn').addEventListener('click', () => {
      App.navigate('study');
    });
  }

  return { render };
})();
