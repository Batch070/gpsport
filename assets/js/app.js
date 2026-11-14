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

  // Parse match date ("15-11-2026") and time ("8:00 am", "11:30 am", "12:00 NOON")
  function parseMatchDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr || timeStr === 'TBA') return null;
    const dateParts = dateStr.split('-').map(Number);
    if (dateParts.length !== 3) return null;
    const [day, month, year] = dateParts;

    let str = timeStr.trim().toLowerCase();
    if (str.includes('noon')) str = '12:00 pm';

    const m = str.match(/(\d+):(\d+)\s*(am|pm)/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;

    return new Date(year, month - 1, day, h, min, 0);
  }

  // Live Match Engine: Calculates live status dynamically based on current date & time
  function getMatchLiveStatus(x, now = new Date()) {
    if (x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match') {
      return 'COMPLETED';
    }
    const start = parseMatchDateTime(x.date, x.time);
    if (!start) return 'UPCOMING';

    // Matches typically span ~50-60 minutes on court
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const nowMs = now.getTime();
    const startMs = start.getTime();
    const endMs = end.getTime();

    if (nowMs >= startMs && nowMs < endMs) {
      return 'LIVE';
    }
    if (nowMs >= (startMs - 20 * 60 * 1000) && nowMs < startMs) {
      return 'STARTING_SOON';
    }
    if (nowMs >= endMs) {
      return 'AWAITING_RESULT';
    }
    return 'UPCOMING';
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
  let currentView = 'cards';
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
      status.innerHTML = `<i class="live-dot" style="background:#22c55e"></i> <span>Connected · Live Updates (${timeStr})</span>`;
    }
    if (updated) {
      updated.textContent = `Official Tournament Portal · Refreshed: ${timeStr}`;
    }
  }

  function renderCard(x, type = 'schedule') {
    const sportClass = getSportBadgeClass(x.sport);
    const roundBadge = getRoundBadgeHtml(x.round || x.event);
    const hasWinner = x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match';
    const liveStatus = getMatchLiveStatus(x);

    let statusPillHtml = '';
    let cardLiveClass = '';

    if (liveStatus === 'LIVE') {
      cardLiveClass = 'is-live';
      statusPillHtml = `<span class="live-pulse-badge"><span class="pulse-dot"></span> LIVE NOW</span>`;
    } else if (liveStatus === 'STARTING_SOON') {
      statusPillHtml = `<span class="starting-soon-badge">⏱️ STARTING SOON</span>`;
    } else if (hasWinner) {
      statusPillHtml = `<span class="round-badge" style="background:#f0fdf4;color:#166534;font-weight:700">✓ Finished</span>`;
    }

    return `
      <article class="match-interactive-card ${cardLiveClass}">
        <div class="card-top-bar">
          <div class="card-badges-left">
            <span class="match-pill-id">M#${esc(x.matchNo)}</span>
            <span class="sport-badge ${sportClass}">${esc(x.sport)}</span>
            ${roundBadge}
            ${statusPillHtml}
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
          <div class="vs-circle">${liveStatus === 'LIVE' ? '🔴' : 'VS'}</div>
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
          ${liveStatus === 'LIVE'
            ? `<span class="live-pulse-badge"><span class="pulse-dot"></span> LIVE ON COURT · ${esc(x.time || 'NOW')}</span>`
            : (liveStatus === 'STARTING_SOON'
              ? `<span class="starting-soon-badge">⏱️ Warmup · Starts at ${esc(x.time)}</span>`
              : `<span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time || 'TBA')}</span>`
            )
          }
          <span class="card-venue-info">
            📍 ${esc(x.venue || 'Govt. Polytechnic Hamirpur')}
          </span>
        </div>
      </article>
    `;
  }

  // Update Live on Court Banner if any matches are active
  function updateLiveBanner(allMatches) {
    const bannerSec = document.querySelector('#live-banner-section');
    const bannerGrid = document.querySelector('#live-banner-content');
    const bannerClock = document.querySelector('#live-banner-clock');

    if (!bannerSec || !bannerGrid) return;

    const now = new Date();
    const liveMatches = (allMatches || []).filter(m => {
      const st = getMatchLiveStatus(m, now);
      return st === 'LIVE' || st === 'STARTING_SOON';
    });

    if (liveMatches.length > 0) {
      bannerSec.style.display = 'block';
      if (bannerClock) {
        bannerClock.textContent = `Court Clock: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      }
      bannerGrid.innerHTML = liveMatches.map(m => {
        const isLive = getMatchLiveStatus(m, now) === 'LIVE';
        return `
          <div class="live-banner-match-item">
            <div class="live-match-meta">
              <span>${esc(m.sport)} · M#${esc(m.matchNo)} (${esc(m.round || m.event)})</span>
              <span class="${isLive ? 'live-pulse-badge' : 'starting-soon-badge'}" style="font-size:9px;padding:2px 8px">
                ${isLive ? '🔴 LIVE' : '⏱️ SOON'}
              </span>
            </div>
            <div class="live-match-teams">
              ${esc(m.teamA)} <span style="color:#ef4444;font-size:12px;margin:0 4px">VS</span> ${esc(m.teamB)}
            </div>
            <div class="live-match-venue">
              ⏰ ${esc(m.time)} · 📍 ${esc(m.venue || 'Hamirpur')}
            </div>
          </div>
        `;
      }).join('');
    } else {
      bannerSec.style.display = 'none';
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

      updateLiveBanner(data.schedule);
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
        tbody.innerHTML = rows.map(x => {
          const liveStatus = getMatchLiveStatus(x);
          const isLiveRow = liveStatus === 'LIVE' ? 'table-row-live' : '';
          return `
            <tr class="${isLiveRow}">
              <td><span class="date-highlight-pill">📅 ${esc(x.date)}</span></td>
              <td><span class="sport-badge ${getSportBadgeClass(x.sport)}">${esc(x.sport)}</span></td>
              <td>
                <div class="table-team-pairing">
                  <div>
                    <span class="match-pill-id" style="font-size:9px;padding:2px 5px">M#${esc(x.matchNo)}</span>
                    ${getRoundBadgeHtml(x.round || x.event)}
                    ${liveStatus === 'LIVE' ? `<span class="live-pulse-badge" style="font-size:9px;padding:2px 6px"><span class="pulse-dot"></span> LIVE</span>` : ''}
                  </div>
                  <div class="pairing-names">
                    ${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)}
                  </div>
                </div>
              </td>
              <td class="table-time-cell">
                ${liveStatus === 'LIVE'
                  ? `<span class="live-pulse-badge"><span class="pulse-dot"></span> LIVE NOW (${esc(x.time)})</span>`
                  : `<span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time)}</span>`
                }
              </td>
              <td>${esc(x.venue)}</td>
            </tr>
          `;
        }).join('');
      }

      if (count) count.textContent = `${rows.length} scheduled ${rows.length === 1 ? 'match' : 'matches'}`;
      if (empty) empty.hidden = rows.length > 0;

      updateLiveBanner(data.schedule);
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

      updateLiveBanner(data.fixtures);
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

  // Then fetch fresh data immediately
  refresh();

  // Background auto-refresh polling (every 30 seconds)
  if (window.SPORTS_CONFIG?.REFRESH_INTERVAL_MS) {
    setInterval(() => refresh(false), window.SPORTS_CONFIG.REFRESH_INTERVAL_MS);
  }

  // Live match clock tick (recomputes live status every 15 seconds)
  setInterval(() => {
    render();
  }, 15000);
})();
