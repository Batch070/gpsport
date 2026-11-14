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

  const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

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

  function render() {
    // 1. Overview / Index page
    if (page === 'index.html') {
      const champBody = document.querySelector('#champions-body');
      if (champBody && data.champions) {
        champBody.innerHTML = data.champions.map(c => `
          <tr>
            <td><strong>${esc(c.sport)}</strong></td>
            <td><strong>${esc(c.champion)}</strong></td>
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
    }

    // 2. Schedule page
    if (page === 'schedule.html') {
      const rows = filtered(data.schedule);
      const tbody = document.querySelector('#schedule-body');
      if (tbody) {
        tbody.innerHTML = rows.map(x => `
          <tr>
            <td><strong>${esc(x.date)}</strong></td>
            <td><span class="sport-tag">${esc(x.sport)}</span></td>
            <td>
              <span class="match-no-badge">M#${esc(x.matchNo)}</span>
              <strong>${esc(x.event)}</strong>
              <div class="team-sub">Pairing: ${esc(x.teamA)} vs ${esc(x.teamB)}</div>
            </td>
            <td>${esc(x.time)}</td>
            <td>${esc(x.venue)}</td>
          </tr>
        `).join('');
      }
      if (count) count.textContent = `${rows.length} schedule ${rows.length === 1 ? 'entry' : 'entries'}`;
      if (empty) empty.hidden = rows.length > 0;
    }

    // 3. Fixtures page
    if (page === 'fixtures.html') {
      const rows = filtered(data.fixtures);
      const grid = document.querySelector('#fixture-grid');
      if (grid) {
        grid.innerHTML = rows.map(x => `
          <article class="match-card">
            <div class="match-card-top">
              <span class="sport-tag">${esc(x.sport)}</span>
              <span><span class="match-no-badge">M#${esc(x.matchNo)}</span> ${esc(x.round)}</span>
            </div>
            <div class="match-versus">
              <div>
                <small>TEAM / INSTITUTE 01</small>
                <strong>${esc(x.teamA)}</strong>
              </div>
              <span>VS</span>
              <div>
                <small>TEAM / INSTITUTE 02</small>
                <strong>${esc(x.teamB)}</strong>
              </div>
            </div>
            ${x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match'
              ? `<div class="match-winner-badge">🏆 Winner: <strong>${esc(x.winner)}</strong></div>`
              : `<div class="match-pending-badge">Status: ${esc(x.status || 'Scheduled')}</div>`
            }
            <div class="match-card-foot">
              <span>📅 ${esc(x.date)} · ⏰ ${esc(x.time)}</span>
              <span>📍 ${esc(x.venue)}</span>
            </div>
          </article>
        `).join('');
      }
      if (count) count.textContent = `${rows.length} fixture ${rows.length === 1 ? 'entry' : 'entries'}`;
      if (empty) empty.hidden = rows.length > 0;
    }

    // 4. Results page
    if (page === 'results.html') {
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
      const tbody = document.querySelector('#results-body');
      if (tbody) {
        tbody.innerHTML = rows.map(x => `
          <tr>
            <td><span class="sport-tag">${esc(x.sport)}</span></td>
            <td>
              <span class="match-no-badge">M#${esc(x.matchNo)}</span>
              <strong>${esc(x.round)}</strong>
              <div class="team-sub">${esc(x.teamA)} vs ${esc(x.teamB)}</div>
            </td>
            <td><strong>${esc(x.winner)}</strong></td>
            <td>${esc(x.runnerUp)}</td>
            <td>
              <span class="${x.status === 'Completed' ? 'status-live-tag' : 'sport-tag'}">
                ${esc(x.score || x.status)}
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
