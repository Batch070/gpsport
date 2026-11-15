/**
 * 28th H.P. Inter-Polytechnic Sports Meet 2026
 * Admin Match Controller & Scorekeeper Engine
 */
(async function() {
  const PASSCODE_KEY = 'GP_ADMIN_PASSCODE';
  const AUTH_SESSION_KEY = 'GP_ADMIN_AUTH_ACTIVE';
  const DEFAULT_PASSCODE = 'admin2026';

  let currentSport = 'Badminton';
  let activeMatch = null;
  let activeMediaList = [];
  let allMatches = [];
  let overridesMap = {};
  let mediaSummaryMap = {};

  // DOM Elements
  const authGate = document.querySelector('#auth-gate');
  const passInput = document.querySelector('#admin-passcode-input');
  const loginBtn = document.querySelector('#btn-admin-login');
  const authErr = document.querySelector('#auth-error-msg');
  const logoutBtn = document.querySelector('#btn-admin-logout');

  const sportTabs = document.querySelector('#admin-sport-tabs');
  const searchInput = document.querySelector('#admin-search');
  const statusFilter = document.querySelector('#admin-status-filter');
  const matchesGrid = document.querySelector('#admin-matches-grid');

  const statLive = document.querySelector('#stat-live-count');
  const statDelayed = document.querySelector('#stat-delayed-count');
  const statCompleted = document.querySelector('#stat-completed-count');

  // Modal Elements
  const modal = document.querySelector('#edit-modal');
  const modalClose = document.querySelector('#btn-close-modal');
  const modalCancel = document.querySelector('#btn-cancel-modal');
  const modalSave = document.querySelector('#btn-save-match');
  const modalReset = document.querySelector('#btn-reset-match');

  const modalMatchId = document.querySelector('#modal-match-id');
  const modalSportTitle = document.querySelector('#modal-sport-title');
  const delayWrap = document.querySelector('#delay-note-wrap');
  const inputDelay = document.querySelector('#input-delay-note');

  const lblTeam1 = document.querySelector('#lbl-team-1-name');
  const lblTeam2 = document.querySelector('#lbl-team-2-name');
  const inputScore1 = document.querySelector('#input-score-team-1');
  const inputScore2 = document.querySelector('#input-score-team-2');
  const inputScoreSummary = document.querySelector('#input-score-summary');

  const btnWinner1 = document.querySelector('#btn-pick-winner-1');
  const btnWinner2 = document.querySelector('#btn-pick-winner-2');
  const inputWinner = document.querySelector('#input-winner');
  const inputRunnerUp = document.querySelector('#input-runner-up');

  const fileInput = document.querySelector('#media-file-input');
  const btnBrowseMedia = document.querySelector('#btn-browse-media');
  const dropArea = document.querySelector('#drop-media-area');
  const inputPhotoUrl = document.querySelector('#input-photo-url');
  const btnAddPhotoUrl = document.querySelector('#btn-add-photo-url');
  const inputVideoUrl = document.querySelector('#input-video-url');
  const btnAddVideoUrl = document.querySelector('#btn-add-video-url');
  const thumbsGrid = document.querySelector('#modal-media-thumbs');

  // 1. Authentication
  function getSavedPasscode() {
    return localStorage.getItem(PASSCODE_KEY) || DEFAULT_PASSCODE;
  }

  function checkAuth() {
    if (sessionStorage.getItem(AUTH_SESSION_KEY) === 'true') {
      authGate.style.display = 'none';
      initDashboard();
    } else {
      authGate.style.display = 'grid';
    }
  }

  loginBtn?.addEventListener('click', () => {
    const entered = (passInput.value || '').trim();
    if (entered === getSavedPasscode()) {
      sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
      authErr.style.display = 'none';
      authGate.style.display = 'none';
      initDashboard();
    } else {
      authErr.style.display = 'block';
    }
  });

  passInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    window.location.reload();
  });

  // 2. Load Data & Dashboard
  async function initDashboard() {
    // Load underlying Google Sheet data snapshot or live data
    if (typeof window.loadSportsData === 'function') {
      const liveData = await window.loadSportsData(true);
      allMatches = liveData.schedule || [];
    } else {
      allMatches = window.SPORTS_INITIAL_DATA?.schedule || [];
    }

    await reloadOverridesAndMedia();
    renderStats();
    renderMatches();
  }

  async function reloadOverridesAndMedia() {
    if (window.AdminStorage) {
      overridesMap = await window.AdminStorage.getAllOverrides();
      mediaSummaryMap = await window.AdminStorage.getMediaSummary();
    }
  }

  function getEffectiveMatch(rawMatch) {
    const id = `${rawMatch.sport}_${rawMatch.matchNo}`;
    const override = overridesMap[id] || {};
    const media = mediaSummaryMap[id] || { count: 0, photos: 0, videos: 0 };

    return {
      ...rawMatch,
      ...override,
      hasOverride: Boolean(overridesMap[id]),
      mediaCount: media.count || 0,
      photoCount: media.photos || 0,
      videoCount: media.videos || 0
    };
  }

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

    if (h >= 1 && h <= 6 && ampm === 'am') {
      h += 12;
      ampm = 'pm';
    } else {
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    }

    return new Date(year, month - 1, day, h, min, 0);
  }

  function getMatchEndTime(m, allList) {
    const start = parseMatchDateTime(m.date, m.time);
    if (!start) return null;

    const list = allList || allMatches || [];
    const sportMatches = list.filter(other => 
      other.sport === m.sport && 
      other.date === m.date && 
      parseInt(other.matchNo) > parseInt(m.matchNo)
    );

    for (const nextM of sportMatches) {
      const nextStart = parseMatchDateTime(nextM.date, nextM.time);
      if (nextStart && nextStart.getTime() > start.getTime()) {
        const diffMs = nextStart.getTime() - start.getTime();
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

  function getMatchLiveStatus(x, now = new Date(), allList = null) {
    if (x.adminStatus === 'LIVE') return 'LIVE';
    if (x.adminStatus === 'DELAYED') return 'DELAYED';
    if (x.adminStatus === 'COMPLETED') return 'COMPLETED';

    if (x.winner && x.winner !== '—' && x.winner !== 'Awaiting Match' && String(x.winner).trim() !== '') {
      return 'COMPLETED';
    }
    const start = parseMatchDateTime(x.date, x.time);
    if (!start) return 'UPCOMING';

    const end = getMatchEndTime(x, allList || allMatches);
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

  function renderStats() {
    let live = 0, delayed = 0, completed = 0;
    const now = new Date();
    allMatches.forEach(raw => {
      const m = getEffectiveMatch(raw);
      const isAutoLive = getMatchLiveStatus(m, now, allMatches) === 'LIVE';
      if (m.adminStatus === 'LIVE' || (!m.adminStatus && isAutoLive)) live++;
      else if (m.adminStatus === 'DELAYED') delayed++;
      else if (m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && m.winner.trim() !== '') completed++;
    });

    if (statLive) statLive.textContent = `🔴 ${live} Live`;
    if (statDelayed) statDelayed.textContent = `⏱️ ${delayed} Delayed`;
    if (statCompleted) statCompleted.textContent = `✓ ${completed} Concluded`;
  }

  function renderMatches() {
    if (!matchesGrid) return;
    const q = (searchInput?.value || '').toLowerCase().trim();
    const stFilter = statusFilter?.value || 'all';
    const now = new Date();

    const sportMatches = allMatches.filter(m => m.sport.toLowerCase() === currentSport.toLowerCase());

    const filtered = sportMatches.filter(raw => {
      const m = getEffectiveMatch(raw);
      const isAutoLive = getMatchLiveStatus(m, now, allMatches) === 'LIVE';
      const str = `${m.matchNo} ${m.round} ${m.teamA} ${m.teamB} ${m.winner || ''}`.toLowerCase();
      if (q && !str.includes(q)) return false;

      if (stFilter === 'live' && m.adminStatus !== 'LIVE' && !isAutoLive) return false;
      if (stFilter === 'delayed' && m.adminStatus !== 'DELAYED') return false;
      if (stFilter === 'completed' && (!m.winner || m.winner === '—')) return false;
      if (stFilter === 'upcoming' && (m.adminStatus === 'LIVE' || isAutoLive || m.adminStatus === 'DELAYED' || m.winner)) return false;

      return true;
    });

    if (!filtered.length) {
      matchesGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">No matches match your filter in ${currentSport}.</div>`;
      return;
    }

    matchesGrid.innerHTML = filtered.map(raw => {
      const m = getEffectiveMatch(raw);
      const hasWinner = Boolean(m.winner && m.winner !== '—' && m.winner !== 'Awaiting Match' && String(m.winner).trim() !== '');
      const isAutoLive = getMatchLiveStatus(m, now, allMatches) === 'LIVE';
      
      let statusClass = '';
      let statusBadge = '<span class="admin-stat-pill">⏰ Scheduled</span>';

      if (m.adminStatus === 'LIVE') {
        statusClass = 'is-live-override';
        statusBadge = '<span class="admin-stat-pill live">🔴 LIVE (Admin Force)</span>';
      } else if (isAutoLive && !m.adminStatus && !hasWinner) {
        statusClass = 'is-live-override';
        statusBadge = '<span class="admin-stat-pill live">🔴 LIVE ON COURT</span>';
      } else if (m.adminStatus === 'DELAYED') {
        statusClass = 'is-delayed-override';
        statusBadge = `<span class="admin-stat-pill delayed">⏱️ DELAYED</span>`;
      } else if (hasWinner) {
        statusClass = 'is-completed-override';
        statusBadge = '<span class="admin-stat-pill completed">✓ Concluded</span>';
      }

      return `
        <div class="admin-match-card ${statusClass}">
          <div class="admin-card-head">
            <div>
              <span class="match-pill-id">M#${m.matchNo}</span>
              <strong style="color:var(--gold-light);margin-left:6px;font-size:12px;">${m.round || m.event}</strong>
            </div>
            ${statusBadge}
          </div>

          <div class="admin-card-teams">
            <div class="admin-team-item">
              <small>TEAM 1</small>
              <strong style="${m.winner === m.teamA ? 'color:#86efac;' : ''}">${m.teamA}</strong>
            </div>
            <div style="text-align:center;color:#b3945b;font:900 11px Manrope;">VS</div>
            <div class="admin-team-item team-2">
              <small>TEAM 2</small>
              <strong style="${m.winner === m.teamB ? 'color:#86efac;' : ''}">${m.teamB}</strong>
            </div>
          </div>

          ${(m.scoreTeam1 || m.scoreTeam2 || m.scoreSummary) ? `
            <div class="admin-card-score-box">
              <span>⚡ Live Score:</span>
              <strong>${m.scoreTeam1 || 0} - ${m.scoreTeam2 || 0} ${m.scoreSummary ? `(${m.scoreSummary})` : ''}</strong>
            </div>
          ` : ''}

          ${hasWinner ? `
            <div style="background:rgba(34,197,94,0.15);border:1px solid #22c55e;padding:6px 10px;border-radius:4px;color:#86efac;font-size:12px;font-weight:700;">
              🏆 Winner: <strong>${m.winner}</strong>
            </div>
          ` : ''}

          ${m.delayNote ? `
            <div style="background:rgba(234,179,8,0.15);border:1px solid #eab308;padding:5px 8px;border-radius:4px;color:#fde047;font-size:11px;">
              ⏱️ Delay Note: ${m.delayNote}
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;">
            <span>📅 ${m.date} · ⏰ ${m.time}</span>
            ${m.mediaCount > 0 ? `<span class="admin-media-badge">📷 ${m.mediaCount} Media</span>` : ''}
          </div>

          <button type="button" class="admin-edit-btn" onclick="window.openMatchEditor('${m.sport}', ${m.matchNo})">
            ⚡ Control Match Score & Status
          </button>
        </div>
      `;
    }).join('');
  }

  // 3. Tab switching
  sportTabs?.addEventListener('click', (e) => {
    const btn = e.target.closest('.admin-tab-btn');
    if (!btn) return;
    sportTabs.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSport = btn.dataset.sport;
    renderMatches();
  });

  searchInput?.addEventListener('input', renderMatches);
  statusFilter?.addEventListener('change', renderMatches);

  // 4. Modal Match Editor
  window.openMatchEditor = async function(sport, matchNo) {
    const raw = allMatches.find(m => m.sport.toLowerCase() === sport.toLowerCase() && parseInt(m.matchNo) === parseInt(matchNo));
    if (!raw) return;

    activeMatch = getEffectiveMatch(raw);
    activeMediaList = (await window.AdminStorage.getMatchMedia(sport, matchNo)) || [];

    modalMatchId.textContent = `M#${activeMatch.matchNo}`;
    modalSportTitle.textContent = `${activeMatch.sport} — ${activeMatch.round}`;

    lblTeam1.textContent = activeMatch.teamA;
    lblTeam2.textContent = activeMatch.teamB;

    btnWinner1.textContent = `👑 Pick ${activeMatch.teamA} as Winner`;
    btnWinner2.textContent = `👑 Pick ${activeMatch.teamB} as Winner`;

    inputScore1.value = activeMatch.scoreTeam1 || '';
    inputScore2.value = activeMatch.scoreTeam2 || '';
    inputScoreSummary.value = activeMatch.scoreSummary || '';

    inputWinner.value = activeMatch.winner || '';
    inputRunnerUp.value = activeMatch.runnerUp || '';
    inputDelay.value = activeMatch.delayNote || '';

    // Set Status Radio
    const st = activeMatch.adminStatus || (activeMatch.winner ? 'COMPLETED' : 'UPCOMING');
    setModalStatus(st);

    renderModalMedia();
    modal.classList.add('active');
  };

  function setModalStatus(st) {
    document.querySelectorAll('.status-radio-label').forEach(lbl => {
      lbl.className = 'status-radio-label';
    });

    const radio = document.querySelector(`input[name="match_status"][value="${st}"]`);
    if (radio) radio.checked = true;

    if (st === 'LIVE') document.querySelector('#lbl-status-live')?.classList.add('selected-live');
    else if (st === 'DELAYED') document.querySelector('#lbl-status-delay')?.classList.add('selected-delay');
    else if (st === 'COMPLETED') document.querySelector('#lbl-status-ended')?.classList.add('selected-end');
    else document.querySelector('#lbl-status-sched')?.classList.add('selected-sched');

    if (delayWrap) delayWrap.style.display = (st === 'DELAYED') ? 'block' : 'none';
  }

  document.querySelectorAll('input[name="match_status"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setModalStatus(e.target.value);
    });
  });

  btnWinner1?.addEventListener('click', () => {
    if (activeMatch) {
      inputWinner.value = activeMatch.teamA;
      inputRunnerUp.value = activeMatch.teamB;
      setModalStatus('COMPLETED');
    }
  });

  btnWinner2?.addEventListener('click', () => {
    if (activeMatch) {
      inputWinner.value = activeMatch.teamB;
      inputRunnerUp.value = activeMatch.teamA;
      setModalStatus('COMPLETED');
    }
  });

  function closeModal() {
    modal.classList.remove('active');
    activeMatch = null;
    activeMediaList = [];
  }

  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);

  // Media Upload Handlers
  btnBrowseMedia?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const isVideo = file.type.startsWith('video');
      const base64 = await compressImageFile(file);
      if (base64) {
        activeMediaList.push({
          id: 'media_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          type: isVideo ? 'video' : 'photo',
          name: file.name,
          src: base64,
          uploadedAt: new Date().toISOString()
        });
      }
    }
    fileInput.value = '';
    renderModalMedia();
  });

  function compressImageFile(file, maxWidth = 1200, quality = 0.82) {
    return new Promise((resolve) => {
      if (file.type && file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  btnAddPhotoUrl?.addEventListener('click', () => {
    const url = (inputPhotoUrl?.value || '').trim();
    if (!url) return;
    activeMediaList.push({
      id: 'media_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'photo',
      name: 'Match Photo',
      src: url,
      isExternal: true,
      uploadedAt: new Date().toISOString()
    });
    inputPhotoUrl.value = '';
    renderModalMedia();
  });

  btnAddVideoUrl?.addEventListener('click', () => {
    const url = (inputVideoUrl?.value || '').trim();
    if (!url) return;
    activeMediaList.push({
      id: 'media_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'video',
      name: 'External Video',
      src: url,
      isExternal: true,
      uploadedAt: new Date().toISOString()
    });
    inputVideoUrl.value = '';
    renderModalMedia();
  });

  function renderModalMedia() {
    if (!thumbsGrid) return;
    if (!activeMediaList.length) {
      thumbsGrid.innerHTML = `<span style="grid-column:1/-1;font-size:12px;color:#64748b;text-align:center;">No photos or videos attached yet.</span>`;
      return;
    }

    thumbsGrid.innerHTML = activeMediaList.map((m, idx) => `
      <div class="media-thumb-item">
        ${m.type === 'photo' 
          ? `<img src="${m.src}" alt="${m.name || 'Photo'}">` 
          : `<video src="${m.src}" controls playsinline></video>`
        }
        <button type="button" class="media-remove-btn" onclick="window.removeMediaItem(${idx})">&times;</button>
      </div>
    `).join('');
  }

  window.removeMediaItem = function(index) {
    activeMediaList.splice(index, 1);
    renderModalMedia();
  };

  // Save Match Handler
  modalSave?.addEventListener('click', async () => {
    if (!activeMatch) return;

    modalSave.disabled = true;
    modalSave.textContent = 'Saving...';

    const selectedStatusRadio = document.querySelector('input[name="match_status"]:checked');
    const adminStatus = selectedStatusRadio ? selectedStatusRadio.value : 'UPCOMING';

    const winnerVal = (inputWinner.value || '').trim();
    const runnerVal = (inputRunnerUp.value || '').trim();

    const overridePayload = {
      adminStatus,
      scoreTeam1: (inputScore1.value || '').trim(),
      scoreTeam2: (inputScore2.value || '').trim(),
      scoreSummary: (inputScoreSummary.value || '').trim(),
      winner: winnerVal || (adminStatus === 'COMPLETED' ? activeMatch.winner : ''),
      runnerUp: runnerVal || (adminStatus === 'COMPLETED' ? activeMatch.runnerUp : ''),
      delayNote: adminStatus === 'DELAYED' ? (inputDelay.value || '').trim() : ''
    };

    // Save in IndexedDB & LocalStorage
    await window.AdminStorage.saveMatchOverride(activeMatch.sport, activeMatch.matchNo, overridePayload);
    await window.AdminStorage.saveMatchMedia(activeMatch.sport, activeMatch.matchNo, activeMediaList);

    await reloadOverridesAndMedia();
    renderStats();
    renderMatches();

    modalSave.disabled = false;
    modalSave.textContent = '💾 Save Match';
    closeModal();
  });

  // Reset Match Handler
  modalReset?.addEventListener('click', async () => {
    if (!activeMatch) return;
    if (!confirm(`Are you sure you want to reset Match #${activeMatch.matchNo} to original Google Sheet data?`)) return;

    await window.AdminStorage.deleteMatchOverride(activeMatch.sport, activeMatch.matchNo);
    await reloadOverridesAndMedia();
    renderStats();
    renderMatches();
    closeModal();
  });

  // Backup Export
  document.querySelector('#btn-backup-data')?.addEventListener('click', async () => {
    const overrides = await window.AdminStorage.getAllOverrides();
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sports_meet_admin_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  // Kickoff
  checkAuth();
})();
