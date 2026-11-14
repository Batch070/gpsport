(() => {
  // Mobile nav toggle
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
  }

  // Normalize page name
  let rawPath = location.pathname.split('/').pop() || 'index.html';
  if (rawPath === '') rawPath = 'index.html';
  if (!rawPath.includes('.')) rawPath += '.html';
  const page = rawPath;

  const search = document.querySelector('#search-input');
  const filter = document.querySelector('#sport-filter');
  const empty = document.querySelector('#empty-state');
  const count = document.querySelector('#row-count');
  const status = document.querySelector('#update-status');
  const updated = document.querySelector('#last-updated');
  const refreshBtn = document.querySelector('#btn-refresh');

  const viewCardsBtn = document.querySelector('#view-cards-btn');
  const viewTableBtn = document.querySelector('#view-table-btn');

  const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  // Sport color helper
  function getSportBadgeClass(sport) {
    const s = String(sport || '').toLowerCase();
    if (s.includes('badminton')) return 'sport-badge-badminton';
    if (s.includes('table') || s === 'tt') return 'sport-badge-tt';
    if (s.includes('volley')) return 'sport-badge-volleyball';
    if (s.includes('basket')) return 'sport-badge-basketball';
    if (s.includes('kabaddi')) return 'sport-badge-kabaddi';
    return '';
  }

  // Round badge styling helper
  function getRoundBadgeHtml(roundStr) {
    const r = String(roundStr || '').toUpperCase();
    if (r === 'FINAL' || (r.includes('FINAL') && !r.includes('QUARTER') && !r.includes('SEMI'))) {
      return `<span class="round-badge round-badge-final">🏆 ${esc(roundStr)}</span>`;
    }
    if (r.includes('SEMI')) {
      return `<span class="round-badge round-badge-semi">⚡ ${esc(roundStr)}</span>`;
    }
    if (r.includes('QUARTER')) {
      return `<span class="round-badge round-badge-qf">${esc(roundStr)}</span>`;
    }
    return `<span class="round-badge">${esc(roundStr)}</span>`;
  }

  // Read ?sport= query parameter if present
  const chosen = new URLSearchParams(location.search).get('sport');
  if (chosen && filter) filter.value = chosen;

  let data = window.SPORTS_LIVE_DATA || window.SPORTS_INITIAL_DATA || {
    schedule: [],
    fixtures: [],
    results: [],
    champions: [],
    institutes: []
  };

  // View mode switcher (Cards vs Table)
  let currentView = 'cards'; // default view
  function setView(view) {
    currentView = view;
    if (viewCardsBtn) viewCardsBtn.classList.toggle('active', view === 'cards');
    if (viewTableBtn) viewTableBtn.classList.toggle('active', view === 'table');

    const schedCards = document.querySelector('#schedule-cards');
    const schedTable = document.querySelector('#schedule-table-wrap');
    if (schedCards && schedTable) {
      schedCards.style.display = view === 'cards' ? 'grid' : 'none';
      schedTable.style.display = view === 'table' ? 'block' : 'none';
    }

    const resCards = document.querySelector('#results-cards');
    const resTable = document.querySelector('#results-table-wrap');
    if (resCards && resTable) {
      resCards.style.display = view === 'cards' ? 'grid' : 'none';
      resTable.style.display = view === 'table' ? 'block' : 'none';
    }
  }

  viewCardsBtn?.addEventListener('click', () => setView('cards'));
  viewTableBtn?.addEventListener('click', () => setView('table'));

  function filtered(items) {
    const q = (search?.value || '').toLowerCase().trim();
    const sport = filter?.value || 'all';
    return (items || []).filter(item => {
      const matchSport = (sport === 'all' || item.sport === sport);
      const matchQuery = !q || JSON.stringify(item).toLowerCase().includes(q);
      return matchSport && matchQuery;
    });
  }

  function setStatus(payload) {
    const timeStr = payload.updatedAt ? new Date(payload.updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
    if (status) {
      if (payload.preview && payload.error) {
        status.innerHTML = `<i class="live-dot" style="background:#eab308"></i> <span>Offline snapshot · Synced at ${timeStr}</span>`;
      } else {
        status.innerHTML = `<i class="live-dot" style="background:#22c55e"></i> <span>Connected · Live Sheet Sync (${timeStr})</span>`;
      }
    }
    if (updated) {
      updated.textContent = (payload.preview && payload.error)
        ? `Snapshot cache · Sheet ID: ${window.SPORTS_CONFIG.SHEET_ID}`
        : `Live Google Sheet sync active · Last refreshed: ${timeStr}`;
    }
  }

  function renderCard(x, type = 'schedule') {
    const sportClass = getSportBadgeClass(x.sport);
    const roundBadge = getRoundBadgeHtml(x.round || x.event);
    const hasWinner = x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match';

    return `
      <article class="match-interactive-card">
        <div class="card-top-bar">
          <div class="card-badges-left">
            <span class="match-pill-id">M#${esc(x.matchNo)}</span>
            <span class="sport-badge ${sportClass}">${esc(x.sport)}</span>
            ${roundBadge}
          </div>
          <div class="card-badges-right">
            <span class="date-highlight-pill">📅 ${esc(x.date)}</span>
          </div>
        </div>

        <div class="card-versus-box">
          <div class="team-box team-a">
            <span class="team-label-tag">TEAM 01</span>
            <strong class="team-name-text">${esc(x.teamA)}</strong>
          </div>
          <div class="vs-circle">VS</div>
          <div class="team-box team-b">
            <span class="team-label-tag">TEAM 02</span>
            <strong class="team-name-text">${esc(x.teamB)}</strong>
          </div>
        </div>

        ${hasWinner
          ? `<div class="match-winner-badge">🏆 Winner: <strong>${esc(x.winner)}</strong> ${x.runnerUp && x.runnerUp !== '—' ? `<small style="margin-left:auto;color:#475569">RU: ${esc(x.runnerUp)}</small>` : ''}</div>`
          : (type === 'results' ? `<div class="match-pending-badge">Status: Yet to be played</div>` : '')
        }

        <div class="card-bottom-bar">
          <span class="time-highlight-pill">
            <span class="time-icon">⏰</span> ${esc(x.time || 'TBA')}
          </span>
          <span class="card-venue-info">
            📍 ${esc(x.venue || 'Govt. Polytechnic Hamirpur')}
          </span>
        </div>
      </article>
    `;
  }

  function render() {
    // 1. Overview / Index page
    if (page === 'index.html') {
      const champBody = document.querySelector('#champions-body');
      if (champBody && data.champions) {
        champBody.innerHTML = data.champions.map(c => `
          <tr>
            <td><strong>${esc(c.sport)}</strong></td>
            <td><strong style="color:var(--navy)">${esc(c.champion)}</strong></td>
            <td>${esc(c.runnerUp)}</td>
            <td>${esc(c.matchesPlayed)} / ${esc(c.totalMatches)}</td>
            <td><span class="sport-tag">${esc(c.status)}</span></td>
          </tr>
        `).join('');
      }

      const instGrid = document.querySelector('#institutes-grid');
      if (instGrid && data.institutes) {
        instGrid.innerHTML = data.institutes.map(inst => `
          <div class="institute-card">
            <span class="institute-badge">${esc(inst.sno)}</span>
            <div class="institute-info">
              <strong>${esc(inst.shortName)}</strong>
              <small>${esc(inst.fullName)}</small>
            </div>
          </div>
        `).join('');
      }

      const homeMatchesGrid = document.querySelector('#home-matches-grid');
      if (homeMatchesGrid && data.schedule) {
        homeMatchesGrid.innerHTML = data.schedule.slice(0, 6).map(x => renderCard(x, 'schedule')).join('');
      }
    }

    // 2. Schedule page
    if (page === 'schedule.html') {
      const rows = filtered(data.schedule);

      // Render Interactive Cards
      const cardsContainer = document.querySelector('#schedule-cards');
      if (cardsContainer) {
        cardsContainer.innerHTML = rows.map(x => renderCard(x, 'schedule')).join('');
      }

      // Render Table Rows
      const tbody = document.querySelector('#schedule-body');
      if (tbody) {
        tbody.innerHTML = rows.map(x => `
          <tr>
            <td><span class="date-highlight-pill">📅 ${esc(x.date)}</span></td>
            <td><span class="sport-badge ${getSportBadgeClass(x.sport)}">${esc(x.sport)}</span></td>
            <td>
              <div class="table-team-pairing">
                <div>
                  <span class="match-pill-id" style="font-size:9px;padding:2px 5px">M#${esc(x.matchNo)}</span>
                  ${getRoundBadgeHtml(x.round || x.event)}
                </div>
                <div class="pairing-names">
                  ${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)}
                </div>
              </div>
            </td>
            <td class="table-time-cell">
              <span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time)}</span>
            </td>
            <td>${esc(x.venue)}</td>
          </tr>
        `).join('');
      }

      if (count) count.textContent = `${rows.length} scheduled ${rows.length === 1 ? 'match' : 'matches'}`;
      if (empty) empty.hidden = rows.length > 0;
    }

    // 3. Fixtures page
    if (page === 'fixtures.html') {
      const rows = filtered(data.fixtures);
      const grid = document.querySelector('#fixture-grid');
      if (grid) {
        grid.innerHTML = rows.map(x => renderCard(x, 'fixtures')).join('');
      }
      if (count) count.textContent = `${rows.length} fixture ${rows.length === 1 ? 'card' : 'cards'}`;
      if (empty) empty.hidden = rows.length > 0;
    }

    // 4. Results page
    if (page === 'results.html') {
      // Champions leaderboard
      const champBody = document.querySelector('#champions-body');
      if (champBody && data.champions) {
        champBody.innerHTML = data.champions.map(c => `
          <tr>
            <td><strong>${esc(c.sport)}</strong></td>
            <td><strong style="color:var(--navy)">${esc(c.champion)}</strong></td>
            <td>${esc(c.runnerUp)}</td>
            <td>${esc(c.matchesPlayed)} / ${esc(c.totalMatches)}</td>
            <td><span class="sport-tag">${esc(c.status)}</span></td>
          </tr>
        `).join('');
      }

      const rows = filtered(data.results);

      // Render Cards View
      const cardsContainer = document.querySelector('#results-cards');
      if (cardsContainer) {
        cardsContainer.innerHTML = rows.map(x => renderCard(x, 'results')).join('');
      }

      // Render Table View
      const tbody = document.querySelector('#results-body');
      if (tbody) {
        tbody.innerHTML = rows.map(x => `
          <tr>
            <td><span class="sport-badge ${getSportBadgeClass(x.sport)}">${esc(x.sport)}</span></td>
            <td>
              <div class="table-team-pairing">
                <div>
                  <span class="match-pill-id" style="font-size:9px;padding:2px 5px">M#${esc(x.matchNo)}</span>
                  ${getRoundBadgeHtml(x.round)}
                </div>
                <div class="pairing-names">
                  ${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)}
                </div>
              </div>
            </td>
            <td><strong style="color:${x.winner && x.winner !== '—' ? '#166534' : 'inherit'}">${esc(x.winner)}</strong></td>
            <td>${esc(x.runnerUp)}</td>
            <td>
              <span class="${x.status === 'Completed' ? 'status-live-tag' : 'time-highlight-pill'}">
                ${x.status === 'Completed' ? `🏆 Completed` : `⏰ ${esc(x.time || 'Scheduled')}`}
              </span>
            </td>
          </tr>
        `).join('');
      }

      if (count) count.textContent = `${rows.length} match ${rows.length === 1 ? 'result' : 'results'}`;
      if (empty) empty.hidden = rows.length > 0;
    }
  }

  async function refresh(isManual = false) {
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
      refreshBtn.disabled = true;
    }
    if (typeof window.loadSportsData === 'function') {
      data = await window.loadSportsData(true);
    }
    setStatus(data);
    render();
    if (refreshBtn) {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
      }, 500);
    }
  }

  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);
  refreshBtn?.addEventListener('click', () => refresh(true));

  // Initial render with current or cached data
  setStatus(data);
  render();

  // Then fetch fresh data from Google Sheets immediately
  refresh();

  // Background auto-refresh polling (every 30 seconds)
  if (window.SPORTS_CONFIG?.REFRESH_INTERVAL_MS) {
    setInterval(() => refresh(false), window.SPORTS_CONFIG.REFRESH_INTERVAL_MS);
  }
})();
