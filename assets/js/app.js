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
    const cleanDate = String(dateStr).trim();
    const dateParts = cleanDate.split('-').map(Number);
    if (dateParts.length !== 3) return null;
    const [day, month, year] = dateParts;

    let str = String(timeStr).trim().toLowerCase();
    if (str.includes('noon')) str = '12:00 pm';

    let h = 0, min = 0, ampm = 'am';
    const mColon = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
    const mSimple = str.match(/(\d{1,2})\s*(am|pm)/);

    if (mColon) {
      h = parseInt(mColon[1], 10);
      min = parseInt(mColon[2], 10);
      ampm = mColon[3] || (h >= 12 ? 'pm' : 'am');
    } else if (mSimple) {
      h = parseInt(mSimple[1], 10);
      min = 0;
      ampm = mSimple[2];
    } else {
      return null;
    }

    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;

    return new Date(year, month - 1, day, h, min, 0);
  }

  // Live Match Engine: Calculates live status dynamically based on current date & time
  function getMatchLiveStatus(x, now = new Date()) {
    // If winner is updated in the Google Sheet, match is ALWAYS completed - never live!
    if (x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '') {
      return 'COMPLETED';
    }
    const start = parseMatchDateTime(x.date, x.time);
    if (!start) return 'UPCOMING';

    // Matches typically span ~60 minutes on court
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
  let currentView = (page === 'results.html') ? 'table' : 'cards';
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
  setView(currentView);

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

  function isWinnerTeam(teamName, winnerName) {
    if (!teamName || !winnerName || winnerName === '—' || winnerName === 'Awaiting Match') return false;
    const cleanT = String(teamName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanW = String(winnerName).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanT || !cleanW) return false;
    if (cleanT === cleanW) return true;
    if (cleanT.includes(cleanW) || cleanW.includes(cleanT)) return true;

    const stopWords = new Set(['polytechnic', 'govt', 'seed', 'bye', 'the', 'team', 'match', 'slot', 'draw', 'pending']);
    const tokensW = String(winnerName).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !stopWords.has(t));
    const tokensT = String(teamName).toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !stopWords.has(t));
    if (tokensW.length && tokensT.length) {
      return tokensW.some(tw => tokensT.includes(tw));
    }
    return false;
  }

  function resolveCardTeamNames(x, allMatches) {
    let teamA = x.teamA;
    let teamB = x.teamB;

    const findWinnerOfMatch = (sport, refNo) => {
      const targetMatch = (allMatches || []).find(m => m.sport === sport && parseInt(m.matchNo) === parseInt(refNo));
      if (targetMatch && targetMatch.winner && targetMatch.winner !== '—' && String(targetMatch.winner).trim() !== '') {
        return targetMatch.winner;
      }
      return null;
    };

    const matchA = String(teamA).match(/winner\s+(?:of\s+)?(?:match\s+)?(\d+)/i);
    if (matchA) {
      const winnerName = findWinnerOfMatch(x.sport, matchA[1]);
      if (winnerName) teamA = winnerName;
    }

    const matchB = String(teamB).match(/winner\s+(?:of\s+)?(?:match\s+)?(\d+)/i);
    if (matchB) {
      const winnerName = findWinnerOfMatch(x.sport, matchB[1]);
      if (winnerName) teamB = winnerName;
    }

    return { teamA, teamB };
  }

  function formatTablePairing(x) {
    const hasWinner = Boolean(x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '');
    if (!hasWinner) {
      return `${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)}`;
    }
    const isTeamAWinner = isWinnerTeam(x.teamA, x.winner);
    const isTeamBWinner = isWinnerTeam(x.teamB, x.winner);

    if (isTeamAWinner) {
      return `<strong style="color:#15803d">👑 ${esc(x.teamA)} (W)</strong> <span class="pairing-versus-sep">def.</span> <span style="opacity:0.65">${esc(x.teamB)}</span>`;
    }
    if (isTeamBWinner) {
      return `<span style="opacity:0.65">${esc(x.teamA)}</span> <span class="pairing-versus-sep">lost to</span> <strong style="color:#15803d">👑 ${esc(x.teamB)} (W)</strong>`;
    }
    return `${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)} <span style="margin-left:6px;color:#15803d;font-weight:700">🏆 ${esc(x.winner)}</span>`;
  }

  function renderCard(rawMatch, type = 'schedule') {
    const allRefMatches = (data.results || []).concat(data.schedule || []).concat(data.fixtures || []);
    const { teamA, teamB } = resolveCardTeamNames(rawMatch, allRefMatches);
    const x = { ...rawMatch, teamA, teamB };

    const sportClass = getSportBadgeClass(x.sport);
    const roundBadge = getRoundBadgeHtml(x.round || x.event);
    const hasWinner = Boolean(x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '');
    const liveStatus = hasWinner ? 'COMPLETED' : getMatchLiveStatus(x);

    let isTeamAWinner = false;
    let isTeamBWinner = false;
    if (hasWinner) {
      isTeamAWinner = isWinnerTeam(x.teamA, x.winner);
      isTeamBWinner = isWinnerTeam(x.teamB, x.winner);
      if (!isTeamAWinner && !isTeamBWinner) {
        if (x.runnerUp && isWinnerTeam(x.teamA, x.runnerUp)) {
          isTeamBWinner = true;
        } else if (x.runnerUp && isWinnerTeam(x.teamB, x.runnerUp)) {
          isTeamAWinner = true;
        }
      }
    }

    let statusPillHtml = '';
    let cardLiveClass = '';

    if (hasWinner) {
      statusPillHtml = `<span class="round-badge card-winner-pill">🏆 Winner: ${esc(x.winner)}</span>`;
    } else if (liveStatus === 'LIVE') {
      cardLiveClass = 'is-live';
      statusPillHtml = `<span class="live-pulse-badge"><span class="pulse-dot"></span> LIVE NOW</span>`;
    } else if (liveStatus === 'STARTING_SOON') {
      statusPillHtml = `<span class="starting-soon-badge">⏱️ STARTING SOON</span>`;
    }

    const teamAClass = isTeamAWinner ? 'is-winner-team' : (isTeamBWinner ? 'is-defeated-team' : '');
    const teamBClass = isTeamBWinner ? 'is-winner-team' : (isTeamAWinner ? 'is-defeated-team' : '');

    const teamALabel = isTeamAWinner ? '🏆 WINNER' : (isTeamBWinner ? 'RUNNER UP' : 'TEAM 01');
    const teamBLabel = isTeamBWinner ? '🏆 WINNER' : (isTeamAWinner ? 'RUNNER UP' : 'TEAM 02');

    return `
      <article class="match-interactive-card ${cardLiveClass} ${hasWinner ? 'is-completed-card' : ''}">
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
          <div class="team-box team-a ${teamAClass}">
            <span class="team-label-tag ${isTeamAWinner ? 'winner-label' : ''}">${teamALabel}</span>
            <strong class="team-name-text">
              ${isTeamAWinner ? '<span class="crown-icon">👑</span> ' : ''}${esc(x.teamA)}
            </strong>
          </div>
          <div class="vs-circle ${hasWinner ? 'vs-finished' : (liveStatus === 'LIVE' ? 'vs-live' : '')}">
            ${hasWinner ? '🏆' : (liveStatus === 'LIVE' ? '🔴' : 'VS')}
          </div>
          <div class="team-box team-b ${teamBClass}">
            <span class="team-label-tag ${isTeamBWinner ? 'winner-label' : ''}">${teamBLabel}</span>
            <strong class="team-name-text">
              ${isTeamBWinner ? '<span class="crown-icon">👑</span> ' : ''}${esc(x.teamB)}
            </strong>
          </div>
        </div>

        ${hasWinner
          ? `<div class="match-winner-badge">
              <span>🏆 Winner: <strong class="winner-name">${esc(x.winner)}</strong></span>
              ${x.runnerUp && x.runnerUp !== '—' ? `<span class="runner-up-label">Runner-Up: ${esc(x.runnerUp)}</span>` : ''}
            </div>`
          : (type === 'results' ? `<div class="match-pending-badge">Status: Match scheduled · Awaiting result</div>` : '')
        }

        <div class="card-bottom-bar">
          ${hasWinner
            ? `<span class="completed-result-pill" style="font-weight:800"><span class="check-icon">🏆</span> Winner: <strong>${esc(x.winner)}</strong></span>`
            : (liveStatus === 'LIVE'
              ? `<span class="live-pulse-badge"><span class="pulse-dot"></span> LIVE ON COURT · ${esc(x.time || 'NOW')}</span>`
              : (liveStatus === 'STARTING_SOON'
                ? `<span class="starting-soon-badge">⏱️ Warmup · Starts at ${esc(x.time)}</span>`
                : `<span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time || 'TBA')}</span>`
              )
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
      // If winner is updated in the Google Sheet, match is completed - NOT live!
      if (m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '') {
        return false;
      }
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

      // Populate dedicated Live Match Cards Section in Overview
      const liveOverviewGrid = document.querySelector('#live-matches-grid');
      const liveOverviewSection = document.querySelector('#live-matches-section');
      const liveEyebrow = document.querySelector('#live-section-eyebrow');
      const liveTitle = document.querySelector('#live-section-title');
      const liveDesc = document.querySelector('#live-section-desc');

      if (liveOverviewGrid && data.schedule) {
        const now = new Date();
        const liveMatches = (data.schedule || []).filter(m => getMatchLiveStatus(m, now) === 'LIVE');
        const soonMatches = (data.schedule || []).filter(m => getMatchLiveStatus(m, now) === 'STARTING_SOON');
        const upcomingMatches = (data.schedule || []).filter(m => getMatchLiveStatus(m, now) === 'UPCOMING');
        const completedWithWinner = (data.schedule || []).filter(m => Boolean(m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== ''));

        if (liveMatches.length > 0) {
          if (liveOverviewSection) liveOverviewSection.style.display = 'block';
          if (liveEyebrow) liveEyebrow.innerHTML = `<span class="pulse-dot"></span> LIVE NOW ON COURT`;
          if (liveTitle) liveTitle.innerHTML = `Live Matches in Progress <span style="font-size:16px;color:#ef4444;font-weight:700">(${liveMatches.length} Live)</span>`;
          if (liveDesc) liveDesc.textContent = `Active matches happening right now on court at Govt. Polytechnic Hamirpur according to official tournament timings. Live scores and court action update in real time.`;
          liveOverviewGrid.innerHTML = liveMatches.map(x => renderCard(x, 'schedule')).join('');
        } else if (soonMatches.length > 0) {
          if (liveOverviewSection) liveOverviewSection.style.display = 'block';
          if (liveEyebrow) liveEyebrow.innerHTML = `<span class="pulse-dot" style="background:#eab308"></span> PRE-MATCH WARMUP`;
          if (liveTitle) liveTitle.textContent = `Starting Soon on Court`;
          if (liveDesc) liveDesc.textContent = `Teams are warming up on court. Matches will commence within minutes.`;
          liveOverviewGrid.innerHTML = soonMatches.map(x => renderCard(x, 'schedule')).join('');
        } else if (completedWithWinner.length > 0) {
          const displayGroup = completedWithWinner.slice(-2).concat(upcomingMatches.slice(0, 2));
          if (liveOverviewSection) liveOverviewSection.style.display = 'block';
          if (liveEyebrow) liveEyebrow.innerHTML = `<span class="pulse-dot" style="background:var(--navy)"></span> TOURNAMENT MATCH CENTRE`;
          if (liveTitle) liveTitle.textContent = `Latest Results & Next on Court`;
          if (liveDesc) liveDesc.textContent = `Concluded matches showing official winners, followed by the next scheduled court fixtures.`;
          liveOverviewGrid.innerHTML = displayGroup.map(x => renderCard(x, 'schedule')).join('');
        } else {
          const displayGroup = upcomingMatches.slice(0, 3);
          if (liveOverviewSection) liveOverviewSection.style.display = 'block';
          if (liveEyebrow) liveEyebrow.innerHTML = `<span class="pulse-dot"></span> SCHEDULED ON COURT`;
          if (liveTitle) liveTitle.textContent = `Opening Matches Scheduled`;
          if (liveDesc) liveDesc.textContent = `Opening fixtures scheduled on court. Live status activates automatically as match time arrives.`;
          liveOverviewGrid.innerHTML = displayGroup.map(x => renderCard(x, 'schedule')).join('');
        }
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
          const hasWin = Boolean(x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '');
          const liveStatus = hasWin ? 'COMPLETED' : getMatchLiveStatus(x);
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
                    ${hasWin 
                      ? `<span class="round-badge card-winner-pill" style="font-size:9px;padding:2px 6px">🏆 Winner: ${esc(x.winner)}</span>` 
                      : (liveStatus === 'LIVE' ? `<span class="live-pulse-badge" style="font-size:9px;padding:2px 6px"><span class="pulse-dot"></span> LIVE</span>` : '')
                    }
                  </div>
                  <div class="pairing-names">
                    ${formatTablePairing(x)}
                  </div>
                </div>
              </td>
              <td class="table-time-cell">
                ${hasWin
                  ? `<span class="completed-result-pill" style="font-size:10px;font-weight:800"><span class="check-icon">🏆</span> Winner: <strong>${esc(x.winner)}</strong></span>`
                  : (liveStatus === 'LIVE'
                    ? `<span class="live-pulse-badge"><span class="pulse-dot"></span> LIVE NOW (${esc(x.time)})</span>`
                    : `<span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time)}</span>`
                  )
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

      // Render Sport-Wise Results Tables
      const resTableWrap = document.querySelector('#results-table-wrap');
      if (resTableWrap) {
        const ALL_SPORTS = ['Badminton', 'Table Tennis', 'Volleyball', 'Basketball', 'Kabaddi'];
        const selectedSport = filter?.value || 'all';
        const sportsToShow = selectedSport === 'all' ? ALL_SPORTS : [selectedSport];

        let html = '';
        sportsToShow.forEach(sportName => {
          const sportMatches = rows.filter(m => m.sport.toLowerCase() === sportName.toLowerCase() || m.sport.toLowerCase().includes(sportName.toLowerCase().replace(' ', '')));
          if (sportMatches.length > 0) {
            html += `
              <div class="sport-result-section">
                <div class="sport-result-header">
                  <div class="sport-title-group">
                    <span class="sport-badge ${getSportBadgeClass(sportName)}">${esc(sportName)}</span>
                    <h3 class="sport-heading">${esc(sportName)} — Official Results</h3>
                  </div>
                  <span class="sport-match-count">${sportMatches.length} ${sportMatches.length === 1 ? 'Match' : 'Matches'} · Live Sheet Synced</span>
                </div>
                <div class="table-wrap">
                  <table class="sport-results-table">
                    <thead>
                      <tr>
                        <th style="width:75px">MATCH #</th>
                        <th style="width:140px">ROUND</th>
                        <th style="width:115px">DATE</th>
                        <th>TEAM 1</th>
                        <th>TEAM 2</th>
                        <th>WINNER</th>
                        <th>RUNNER-UP</th>
                        <th style="width:110px">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${sportMatches.map(m => {
                        const isWinner1 = isWinnerTeam(m.teamA, m.winner);
                        const isWinner2 = isWinnerTeam(m.teamB, m.winner);
                        const hasWin = Boolean(m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '');
                        const isCompleted = m.status === 'Completed' || hasWin;

                        return `
                          <tr>
                            <td><span class="match-pill-id">M#${esc(m.matchNo)}</span></td>
                            <td>${getRoundBadgeHtml(m.round)}</td>
                            <td><span class="date-highlight-pill">📅 ${esc(m.date)}</span></td>
                            <td>
                              <span class="table-team-cell ${isWinner1 ? 'is-winner' : (hasWin ? 'is-loser' : '')}">
                                ${isWinner1 ? '👑 ' : ''}${esc(m.teamA)}
                              </span>
                            </td>
                            <td>
                              <span class="table-team-cell ${isWinner2 ? 'is-winner' : (hasWin ? 'is-loser' : '')}">
                                ${isWinner2 ? '👑 ' : ''}${esc(m.teamB)}
                              </span>
                            </td>
                            <td>
                              ${hasWin 
                                ? `<span class="table-winner-cell">🏆 <strong>${esc(m.winner)}</strong></span>` 
                                : `<span style="color:#94a3b8;font-size:12px">Awaiting Match</span>`
                              }
                            </td>
                            <td>
                              ${m.runnerUp && m.runnerUp !== '—' 
                                ? `<span style="color:#475569;font-weight:600">${esc(m.runnerUp)}</span>` 
                                : `<span style="color:#cbd5e1">—</span>`
                              }
                            </td>
                            <td>
                              <span class="table-status-pill ${isCompleted ? 'completed' : 'pending'}">
                                ${isCompleted ? '✓ Concluded' : '⏰ Scheduled'}
                              </span>
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }
        });

        resTableWrap.innerHTML = html || `<div class="empty-state">No published results match your filter.</div>`;
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
