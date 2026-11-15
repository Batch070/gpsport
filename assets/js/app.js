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

    // Auto-correct PM typos for afternoon matches (e.g. 2:00 am, 3:00 am, 4:15 am)
    if (h >= 1 && h <= 6 && ampm === 'am') {
      h += 12;
      ampm = 'pm';
    } else {
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    }

    return new Date(year, month - 1, day, h, min, 0);
  }

  function getAdminCache() {
    try {
      return JSON.parse(localStorage.getItem('SPORTS_ADMIN_CACHE') || '{}');
    } catch {
      return {};
    }
  }

  function getMediaCache() {
    try {
      return JSON.parse(localStorage.getItem('SPORTS_MEDIA_CACHE') || '{}');
    } catch {
      return {};
    }
  }

  function applyAdminOverride(rawMatch) {
    if (!rawMatch) return rawMatch;
    const overrides = getAdminCache();
    const id = `${rawMatch.sport}_${rawMatch.matchNo}`;
    const override = overrides[id];
    if (!override) return rawMatch;
    return {
      ...rawMatch,
      ...override,
      winner: (override.winner && override.winner.trim() !== '') ? override.winner : rawMatch.winner,
      runnerUp: (override.runnerUp && override.runnerUp.trim() !== '') ? override.runnerUp : rawMatch.runnerUp
    };
  }

  // Dynamic court match window: runs until the next match of the same sport begins,
  // or default duration (Basketball & Kabaddi: 90 mins, Volleyball: 75 mins, Badminton & TT: 60 mins).
  function getMatchEndTime(m, allMatches) {
    const start = parseMatchDateTime(m.date, m.time);
    if (!start) return null;

    const list = allMatches || (data && data.schedule) || [];
    const sportMatches = list.filter(other => 
      other.sport === m.sport && 
      other.date === m.date && 
      parseInt(other.matchNo) > parseInt(m.matchNo)
    );

    for (const nextM of sportMatches) {
      const nextStart = parseMatchDateTime(nextM.date, nextM.time);
      if (nextStart && nextStart.getTime() > start.getTime()) {
        const diffMs = nextStart.getTime() - start.getTime();
        // If next match is scheduled within 3.5 hours, the court is active for this match until the next match begins
        if (diffMs <= 3.5 * 60 * 60 * 1000) {
          return nextStart;
        }
        break;
      }
    }

    const s = String(m.sport || '').toLowerCase();
    let defaultMinutes = 75;
    if (s.includes('basket') || s.includes('kabad')) defaultMinutes = 90;
    else if (s.includes('volley')) defaultMinutes = 75;
    else defaultMinutes = 60;

    return new Date(start.getTime() + defaultMinutes * 60 * 1000);
  }

  // Live Match Engine: Calculates live status dynamically based on current date & time or admin override
  function getMatchLiveStatus(x, now = new Date(), allMatches = null) {
    if (x.adminStatus === 'LIVE') return 'LIVE';
    if (x.adminStatus === 'DELAYED') return 'DELAYED';
    if (x.adminStatus === 'COMPLETED') return 'COMPLETED';

    // If winner is updated in the Google Sheet or override, match is ALWAYS completed - never live!
    if (x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '') {
      return 'COMPLETED';
    }
    const start = parseMatchDateTime(x.date, x.time);
    if (!start) return 'UPCOMING';

    const end = getMatchEndTime(x, allMatches || (data && data.schedule) || []);
    const nowMs = now.getTime();
    const startMs = start.getTime();
    const endMs = end ? end.getTime() : (startMs + 75 * 60 * 1000);

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

  function formatTablePairing(rawMatch) {
    const x = applyAdminOverride(rawMatch);
    const hasWinner = Boolean(x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '');
    const hasScore = Boolean(x.scoreTeam1 || x.scoreTeam2 || x.scoreSummary);
    const scoreText = hasScore ? ` <span style="display:inline-block;padding:1px 6px;background:#fef08a;border:1px solid #eab308;border-radius:4px;color:#854d0e;font-size:11px;font-weight:800;margin-left:6px;">⚡ ${esc(x.scoreTeam1 || 0)}-${esc(x.scoreTeam2 || 0)}</span>` : '';

    if (!hasWinner) {
      return `${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)}${scoreText}`;
    }
    const isTeamAWinner = isWinnerTeam(x.teamA, x.winner);
    const isTeamBWinner = isWinnerTeam(x.teamB, x.winner);

    if (isTeamAWinner) {
      return `<strong style="color:#15803d">👑 ${esc(x.teamA)} (W)</strong> <span class="pairing-versus-sep">def.</span> <span style="opacity:0.65">${esc(x.teamB)}</span>${scoreText}`;
    }
    if (isTeamBWinner) {
      return `<span style="opacity:0.65">${esc(x.teamA)}</span> <span class="pairing-versus-sep">lost to</span> <strong style="color:#15803d">👑 ${esc(x.teamB)} (W)</strong>${scoreText}`;
    }
    return `${esc(x.teamA)} <span class="pairing-versus-sep">VS</span> ${esc(x.teamB)} <span style="margin-left:6px;color:#15803d;font-weight:700">🏆 ${esc(x.winner)}</span>${scoreText}`;
  }

  function renderCard(rawMatch, type = 'schedule') {
    const item = applyAdminOverride(rawMatch);
    const allRefMatches = (data.results || []).concat(data.schedule || []).concat(data.fixtures || []).map(applyAdminOverride);
    const { teamA, teamB } = resolveCardTeamNames(item, allRefMatches);
    const x = { ...item, teamA, teamB };

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
    } else if (liveStatus === 'DELAYED') {
      statusPillHtml = `<span class="match-delayed-badge">⏱️ DELAYED</span>`;
    } else if (liveStatus === 'STARTING_SOON') {
      statusPillHtml = `<span class="starting-soon-badge">⏱️ STARTING SOON</span>`;
    }

    const teamAClass = isTeamAWinner ? 'is-winner-team' : (isTeamBWinner ? 'is-defeated-team' : '');
    const teamBClass = isTeamBWinner ? 'is-winner-team' : (isTeamAWinner ? 'is-defeated-team' : '');

    const teamALabel = isTeamAWinner ? '🏆 WINNER' : (isTeamBWinner ? 'RUNNER UP' : 'TEAM 01');
    const teamBLabel = isTeamBWinner ? '🏆 WINNER' : (isTeamAWinner ? 'RUNNER UP' : 'TEAM 02');

    // Score pill
    const hasScore = Boolean(x.scoreTeam1 || x.scoreTeam2 || x.scoreSummary);
    const scorePillHtml = hasScore ? `
      <div class="match-live-score-pill">
        <span>⚡ Live Score:</span>
        <strong>${esc(x.scoreTeam1 || 0)} - ${esc(x.scoreTeam2 || 0)}</strong>
        ${x.scoreSummary ? `<small>(${esc(x.scoreSummary)})</small>` : ''}
      </div>
    ` : '';

    // Media button
    const mediaCache = getMediaCache();
    const mediaInfo = mediaCache[`${x.sport}_${x.matchNo}`];
    const mediaBtnHtml = (mediaInfo && mediaInfo.count > 0) ? `
      <button type="button" class="match-media-btn" onclick="window.viewMatchMedia('${esc(x.sport)}', ${x.matchNo})">
        📷 Photos/Videos (${mediaInfo.count})
      </button>
    ` : '';

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

        ${mediaInfo && mediaInfo.previewSrc ? `
          <div class="card-match-photo-wrap" onclick="window.viewMatchMedia('${esc(x.sport)}', ${x.matchNo})">
            <img src="${mediaInfo.previewSrc}" alt="${esc(x.teamA)} vs ${esc(x.teamB)} match photo" class="card-match-photo" loading="lazy">
            <div class="card-photo-overlay">
              <span class="card-photo-badge">📷 ${mediaInfo.count} ${mediaInfo.count === 1 ? 'Photo' : 'Photos/Videos'} · Highlights ↗</span>
            </div>
          </div>
        ` : ''}

        ${scorePillHtml}

        ${(x.delayNote && liveStatus === 'DELAYED') ? `
          <div style="margin-top:8px;padding:6px 10px;background:#fef08a;border:1px solid #eab308;border-radius:6px;color:#854d0e;font-size:11px;font-weight:700;">
            ⏱️ Notice: ${esc(x.delayNote)}
          </div>
        ` : ''}

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
          : (liveStatus === 'DELAYED'
            ? `<span class="match-delayed-badge">⏱️ DELAYED · ${esc(x.delayNote || 'Notice issued')}</span>`
            : (liveStatus === 'STARTING_SOON'
              ? `<span class="starting-soon-badge">⏱️ Warmup · Starts at ${esc(x.time)}</span>`
              : `<span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time || 'TBA')}</span>`
            )
          )
        )
      }
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;">
            ${mediaBtnHtml}
            <span class="card-venue-info">
              📍 ${esc(x.venue || 'Govt. Polytechnic Hamirpur')}
            </span>
          </div>
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
    const liveMatches = (allMatches || []).map(applyAdminOverride).filter(m => {
      // If winner is updated in the Google Sheet or override, match is completed - NOT live!
      if (m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '') {
        return false;
      }
      if (m.adminStatus === 'DELAYED' || m.adminStatus === 'COMPLETED') return false;
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
            ${(m.scoreTeam1 || m.scoreTeam2) ? `
              <div style="font-size:11px;font-weight:800;color:#fde047;margin-top:2px;">
                ⚡ Score: ${esc(m.scoreTeam1)} - ${esc(m.scoreTeam2)} ${m.scoreSummary ? `(${esc(m.scoreSummary)})` : ''}
              </div>
            ` : ''}
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

  // Update Real-Time Moving Marquee Ticker with Winner Updates
  function updateWinnerMarquee() {
    const marqueeEl = document.querySelector('#winner-marquee-content');
    if (!marqueeEl) return;

    const allMatches = (data.results || []).concat(data.schedule || []).map(applyAdminOverride);

    // Find all matches with winners
    const winners = [];
    const seen = new Set();
    allMatches.forEach(m => {
      const key = `${m.sport}_${m.matchNo}`;
      if (seen.has(key)) return;
      if (m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '') {
        seen.add(key);
        const { teamA, teamB } = resolveCardTeamNames(m, allMatches);
        const defeatedTeam = isWinnerTeam(teamA, m.winner) ? teamB : (isWinnerTeam(teamB, m.winner) ? teamA : '');
        winners.push({
          sport: m.sport,
          matchNo: m.matchNo,
          round: m.round || m.event || 'Match',
          winner: m.winner,
          defeated: defeatedTeam,
          score: (m.scoreTeam1 && m.scoreTeam2) ? `${m.scoreTeam1}-${m.scoreTeam2}` : (m.scoreSummary || '')
        });
      }
    });

    let itemsHtml = '';
    if (winners.length > 0) {
      itemsHtml = winners.map(w => `
        <span class="marquee-item">
          <span class="marquee-winner-pill">🏆 ${esc(w.sport)} M#${esc(w.matchNo)}</span>
          <strong>${esc(w.winner)}</strong>
          ${w.defeated ? `<span style="opacity:0.8">def. ${esc(w.defeated)}</span>` : ''}
          ${w.score ? `<span style="color:#fde047;font-weight:700;">(${esc(w.score)})</span>` : ''}
          <span class="marquee-sep">✦</span>
        </span>
      `).join('');
      marqueeEl.innerHTML = itemsHtml + itemsHtml;
    } else {
      const defaultText = `
        <span class="marquee-item">
          <span class="marquee-winner-pill" style="background:rgba(234,179,8,0.25);border-color:#eab308;color:#fde047;">📢 LIVE TOURNAMENT TICKER</span>
          <strong>28th H.P. Inter-Polytechnic Sports Meet 2026</strong>
          <span>Court action underway at Govt. Polytechnic Hamirpur · Badminton, Table Tennis, Volleyball, Basketball & Kabaddi</span>
          <span class="marquee-sep">✦</span>
          <span>Official match winners and published scorecards will scroll here in real time as matches conclude!</span>
          <span class="marquee-sep">✦</span>
        </span>
      `;
      marqueeEl.innerHTML = defaultText + defaultText;
    }
  }

  // Render Public Match Pictures & Highlights Gallery
  function renderPublicHighlights() {
    const grid = document.querySelector('#public-highlights-grid');
    if (!grid) return;
    const mediaCache = getMediaCache();
    const allMatches = (data.schedule || []).concat(data.results || []).map(applyAdminOverride);

    const items = [];
    Object.keys(mediaCache).forEach(key => {
      const info = mediaCache[key];
      if (info && info.previewSrc) {
        const [sport, matchNo] = key.split('_');
        const match = allMatches.find(m => m.sport === sport && parseInt(m.matchNo) === parseInt(matchNo));
        const { teamA, teamB } = resolveCardTeamNames(match || { sport, matchNo, teamA: 'Team 1', teamB: 'Team 2' }, allMatches);
        items.push({
          sport,
          matchNo,
          previewSrc: info.previewSrc,
          count: info.count || 1,
          photos: info.photos || 1,
          videos: info.videos || 0,
          teamA: teamA || match?.teamA || 'Team 1',
          teamB: teamB || match?.teamB || 'Team 2',
          round: match?.round || match?.event || 'Tournament Match',
          winner: match?.winner || ''
        });
      }
    });

    if (items.length > 0) {
      grid.innerHTML = items.map(item => `
        <div class="highlight-photo-card" onclick="window.viewMatchMedia('${esc(item.sport)}', ${item.matchNo})">
          <div class="highlight-img-wrap">
            <img src="${item.previewSrc}" alt="${esc(item.teamA)} vs ${esc(item.teamB)}" loading="lazy">
            <span class="highlight-media-count">📷 ${item.count}</span>
            <span class="sport-badge ${getSportBadgeClass(item.sport)}" style="position:absolute;top:10px;left:10px;">${esc(item.sport)}</span>
          </div>
          <div class="highlight-card-body">
            <div style="font-size:11px;color:var(--gold-light);font-weight:700;">M#${item.matchNo} · ${esc(item.round)}</div>
            <strong style="font-size:13px;color:#fff;display:block;margin:4px 0;">${esc(item.teamA)} vs ${esc(item.teamB)}</strong>
            ${item.winner ? `<small style="color:#86efac;font-weight:700;">🏆 Winner: ${esc(item.winner)}</small>` : '<small style="color:#94a3b8;">Click to view photos & highlights ↗</small>'}
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = `
        <div class="highlights-placeholder-card">
          <div style="font-size:32px;margin-bottom:8px;">📸</div>
          <strong style="color:#fff;font-size:15px;display:block;margin-bottom:6px;">Tournament Court Photos & Highlights</strong>
          <p style="color:#94a3b8;font-size:12px;margin:0 auto;max-width:440px;">
            Match pictures and court video clips uploaded by organizers will appear here in real time throughout the championship.
          </p>
        </div>
      `;
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
        const effectiveSchedule = (data.schedule || []).map(applyAdminOverride);
        const liveMatches = effectiveSchedule.filter(m => getMatchLiveStatus(m, now) === 'LIVE');
        const soonMatches = effectiveSchedule.filter(m => getMatchLiveStatus(m, now) === 'STARTING_SOON');
        const upcomingMatches = effectiveSchedule.filter(m => getMatchLiveStatus(m, now) === 'UPCOMING');
        const completedWithWinner = effectiveSchedule.filter(m => Boolean(m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== ''));

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

      // TODAY'S MATCH WINNERS: Shows match winners of today (or latest concluded matches)
      const todayWinnersGrid = document.querySelector('#today-winners-grid');
      const todayWinnersTitle = document.querySelector('#today-winners-title');
      const todayWinnersDesc = document.querySelector('#today-winners-desc');

      if (todayWinnersGrid) {
        const now = new Date();
        const todayDateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        const allMatches = (data.results || []).concat(data.schedule || []).map(applyAdminOverride);

        // Find matches with winners
        const seen = new Set();
        const matchesWithWinners = [];
        allMatches.forEach(m => {
          const key = `${m.sport}_${m.matchNo}`;
          if (seen.has(key)) return;
          if (m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '') {
            seen.add(key);
            matchesWithWinners.push(m);
          }
        });

        // Filter for today's winners
        const todayWinners = matchesWithWinners.filter(m => m.date === todayDateStr);

        if (todayWinners.length > 0) {
          if (todayWinnersTitle) todayWinnersTitle.textContent = `Match Winners of the Day (${todayWinners.length} Decided)`;
          if (todayWinnersDesc) todayWinnersDesc.innerHTML = `Official match winners crowned today (<strong>${todayDateStr}</strong>) across all disciplines. <a class="text-link" href="results.html" style="color:var(--navy);font-weight:700;display:inline-block;margin-left:6px">View all tournament results <span>→</span></a>`;
          todayWinnersGrid.innerHTML = todayWinners.map(x => renderCard(x, 'results')).join('');
        } else if (matchesWithWinners.length > 0) {
          // If none on today's exact date yet, show latest tournament winners
          if (todayWinnersTitle) todayWinnersTitle.textContent = `Latest Match Winners (${matchesWithWinners.length} Concluded)`;
          if (todayWinnersDesc) todayWinnersDesc.innerHTML = `Latest concluded matches showing crowned winners. Today's match winners will appear here as ongoing games finish. <a class="text-link" href="results.html" style="color:var(--navy);font-weight:700;display:inline-block;margin-left:6px">View all results <span>→</span></a>`;
          todayWinnersGrid.innerHTML = matchesWithWinners.slice(0, 6).map(x => renderCard(x, 'results')).join('');
        } else {
          // No winners decided yet
          if (todayWinnersTitle) todayWinnersTitle.textContent = `Today's Match Winners`;
          if (todayWinnersDesc) todayWinnersDesc.innerHTML = `Matches for Day 1 (<strong>${todayDateStr}</strong>) are currently in progress on court. Winners will be updated automatically as soon as each scorecard concludes.`;
          todayWinnersGrid.innerHTML = `
            <div class="highlights-placeholder-card" style="grid-column: 1 / -1;">
              <div style="font-size:32px;margin-bottom:8px;">🏆</div>
              <strong style="color:#fff;font-size:16px;display:block;margin-bottom:6px;">Today's Matches in Progress</strong>
              <p style="color:#94a3b8;font-size:13px;margin:0 auto;max-width:520px;">
                Opening round matches for today (${todayDateStr}) are currently underway on court at Govt. Polytechnic Hamirpur. As match scorecards conclude and official winners are entered, winner cards will appear right here.
              </p>
              <div style="margin-top:14px;">
                <a href="schedule.html" class="btn btn-gold" style="font-size:12px;padding:8px 18px;">View Live Timetable & Schedule →</a>
              </div>
            </div>
          `;
        }
      }

      updateLiveBanner(data.schedule);
      updateWinnerMarquee();
      renderPublicHighlights();
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
        tbody.innerHTML = rows.map(raw => {
          const x = applyAdminOverride(raw);
          const hasWin = Boolean(x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '');
          const liveStatus = hasWin ? 'COMPLETED' : getMatchLiveStatus(x);
          const isLiveRow = liveStatus === 'LIVE' ? 'table-row-live' : '';
          const mediaCache = getMediaCache();
          const mediaInfo = mediaCache[`${x.sport}_${x.matchNo}`];
          const mediaBtn = (mediaInfo && mediaInfo.count > 0) ? `
            <button type="button" class="match-media-btn" style="padding:2px 7px;font-size:9px" onclick="window.viewMatchMedia('${esc(x.sport)}', ${x.matchNo})">📷 ${mediaInfo.count}</button>
          ` : '';

          return `
            <tr class="${isLiveRow}">
              <td><span class="date-highlight-pill">📅 ${esc(x.date)}</span></td>
              <td><span class="sport-badge ${getSportBadgeClass(x.sport)}">${esc(x.sport)}</span></td>
              <td>
                <div class="table-team-pairing">
                  <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                    <span class="match-pill-id" style="font-size:9px;padding:2px 5px">M#${esc(x.matchNo)}</span>
                    ${getRoundBadgeHtml(x.round || x.event)}
                    ${hasWin
              ? `<span class="round-badge card-winner-pill" style="font-size:9px;padding:2px 6px">🏆 Winner: ${esc(x.winner)}</span>`
              : (liveStatus === 'LIVE'
                ? `<span class="live-pulse-badge" style="font-size:9px;padding:2px 6px"><span class="pulse-dot"></span> LIVE</span>`
                : (liveStatus === 'DELAYED' ? `<span class="match-delayed-badge" style="font-size:9px;padding:2px 6px">⏱️ DELAYED</span>` : '')
              )
            }
                    ${mediaBtn}
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
                : (liveStatus === 'DELAYED'
                  ? `<span class="match-delayed-badge" style="font-size:10px;">⏱️ Delayed (${esc(x.delayNote || x.time)})</span>`
                  : `<span class="time-highlight-pill"><span class="time-icon">⏰</span> ${esc(x.time)}</span>`
                )
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
      updateWinnerMarquee();
      renderPublicHighlights();
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
                      ${sportMatches.map(raw => {
              const m = applyAdminOverride(raw);
              const isWinner1 = isWinnerTeam(m.teamA, m.winner);
              const isWinner2 = isWinnerTeam(m.teamB, m.winner);
              const hasWin = Boolean(m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '');
              const isCompleted = m.status === 'Completed' || hasWin || m.adminStatus === 'COMPLETED';
              const mediaCache = getMediaCache();
              const mediaInfo = mediaCache[`${m.sport}_${m.matchNo}`];
              const mediaBtn = (mediaInfo && mediaInfo.count > 0) ? `
                          <button type="button" class="match-media-btn" style="padding:2px 7px;font-size:9px" onclick="window.viewMatchMedia('${esc(m.sport)}', ${m.matchNo})">📷 ${mediaInfo.count}</button>
                        ` : '';

              return `
                          <tr>
                            <td>
                              <span class="match-pill-id">M#${esc(m.matchNo)}</span>
                              ${mediaBtn}
                            </td>
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
                              ${(m.scoreTeam1 || m.scoreTeam2 || m.scoreSummary) ? `
                                <div style="font-size:11px;color:#854d0e;font-weight:700;margin-top:2px;">
                                  ⚡ Score: ${esc(m.scoreTeam1 || 0)} - ${esc(m.scoreTeam2 || 0)}
                                </div>
                              ` : ''}
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

  // Public Match Media Lightbox Viewer
  window.viewMatchMedia = async function (sport, matchNo) {
    let modal = document.querySelector('#public-media-lightbox');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'public-media-lightbox';
      modal.className = 'public-media-modal';
      document.body.appendChild(modal);
    }

    let mediaList = [];
    if (window.AdminStorage && typeof window.AdminStorage.getMatchMedia === 'function') {
      try {
        mediaList = await window.AdminStorage.getMatchMedia(sport, matchNo);
      } catch { }
    }

    modal.innerHTML = `
      <div class="public-media-window">
        <div class="public-media-head">
          <div>
            <h3>${esc(sport)} — Match #${esc(matchNo)} Media</h3>
            <small style="color:var(--gold-light);font-weight:600;">${mediaList.length} photo(s) & video(s) uploaded</small>
          </div>
          <button type="button" class="public-media-close" aria-label="Close" onclick="document.querySelector('#public-media-lightbox').classList.remove('active')">&times;</button>
        </div>
        <div class="public-media-grid">
          ${mediaList.length ? mediaList.map(m => `
            <div class="public-media-card">
              ${m.type === 'photo'
        ? `<img src="${m.src}" alt="${esc(m.name || 'Photo')}" loading="lazy" style="width:100%;height:180px;object-fit:cover;cursor:pointer;" onclick="window.open('${m.src}', '_blank')">`
        : `<video src="${m.src}" controls playsinline style="width:100%;height:180px;background:#000;object-fit:cover;"></video>`
      }
              <div style="padding:8px 12px;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center;">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${esc(m.name || (m.type === 'photo' ? 'Photo' : 'Video'))}</span>
                <span>${m.type === 'photo' ? '📷 Photo' : '🎥 Video'}</span>
              </div>
            </div>
          `).join('') : '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">No photos or videos attached to this match yet.</div>'}
        </div>
      </div>
    `;
    modal.classList.add('active');

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.querySelector('#public-media-lightbox');
      if (modal) modal.classList.remove('active');
    }
  });

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

  // Background IndexedDB cache sync
  if (window.AdminStorage) {
    window.AdminStorage.getAllOverrides().then(() => render());
    window.AdminStorage.getMediaSummary().then(() => render());
  }

  // Background auto-refresh polling (every 30 seconds)
  if (window.SPORTS_CONFIG?.REFRESH_INTERVAL_MS) {
    setInterval(() => refresh(false), window.SPORTS_CONFIG.REFRESH_INTERVAL_MS);
  }

  // Live match clock tick (recomputes live status every 15 seconds)
  setInterval(() => {
    render();
  }, 15000);
})();
