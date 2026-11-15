/**
 * 28th H.P. Inter-Polytechnic Sports Meet 2026
 * Admin IndexedDB & Cloud Sync Manager for Match Scores, Live Status & Media
 * Automatically syncs admin overrides across all devices (phones, tablets, PCs)
 */
(function() {
  const DB_NAME = 'GPSportsMeetAdminDB';
  const DB_VERSION = 1;
  const STORE_MATCHES = 'matchOverrides';
  const STORE_MEDIA = 'matchMedia';

  // Auto-detect ?sync_url= from URL query string
  try {
    const p = new URLSearchParams(window.location?.search || '').get('sync_url');
    if (p) {
      const decoded = decodeURIComponent(p);
      localStorage.setItem('SPORTS_CLOUD_SYNC_URL', decoded);
      console.log('AdminStorage: Configured Cloud Sync URL from link:', decoded);
    }
  } catch {}

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MATCHES)) {
          db.createObjectStore(STORE_MATCHES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  window.AdminStorage = {
    // Unique device identifier to prevent loop conflicts
    getDeviceId() {
      let id = localStorage.getItem('SPORTS_DEVICE_ID');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('SPORTS_DEVICE_ID', id);
      }
      return id;
    },

    // Get configured cloud sync endpoint (Google Apps Script Web App, Firebase, or custom REST API)
    getCloudSyncUrl() {
      return localStorage.getItem('SPORTS_CLOUD_SYNC_URL') || window.SPORTS_CONFIG?.CLOUD_SYNC_URL || '';
    },

    // Save cloud sync endpoint and immediately pull from it
    async setCloudSyncUrl(url) {
      const clean = String(url || '').trim();
      if (clean) {
        localStorage.setItem('SPORTS_CLOUD_SYNC_URL', clean);
      } else {
        localStorage.removeItem('SPORTS_CLOUD_SYNC_URL');
      }
      return this.pullFromCloud();
    },

    // Push local admin overrides & media summaries to the cloud endpoint
    async pushToCloud() {
      const url = this.getCloudSyncUrl();
      if (!url) return false;

      try {
        const overrides = this.getFallbackCache();
        const mediaSummary = this.getMediaCache();
        const payload = {
          overrides,
          mediaSummary,
          updatedAt: new Date().toISOString(),
          deviceId: this.getDeviceId()
        };

        let targetUrl = url;
        let method = 'POST';
        // Handle Firebase RTDB URL (needs .json at end and PUT method)
        if (url.includes('firebaseio.com')) {
          targetUrl = url.endsWith('.json') ? url : `${url.replace(/\/+$/, '')}/overrides.json`;
          method = 'PUT';
        }

        const res = await fetch(targetUrl, {
          method: method,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        return res.ok;
      } catch (err) {
        console.warn('AdminStorage: Cloud sync push error:', err);
        return false;
      }
    },

    // Pull latest overrides from cloud endpoint and update local caches
    async pullFromCloud() {
      const url = this.getCloudSyncUrl();
      if (!url) return false;

      try {
        let targetUrl = url;
        if (url.includes('firebaseio.com')) {
          targetUrl = url.endsWith('.json') ? url : `${url.replace(/\/+$/, '')}/overrides.json`;
        }
        const separator = targetUrl.includes('?') ? '&' : '?';
        const fetchUrl = `${targetUrl}${separator}_t=${Date.now()}`;

        const res = await fetch(fetchUrl, { cache: 'no-store' });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data) return false;

        // Extract overrides from payload or direct map
        const cloudOverrides = data.overrides || (data.Badminton_1 || Object.keys(data).some(k => k.includes('_')) ? data : null);
        let hasUpdates = false;

        if (cloudOverrides && typeof cloudOverrides === 'object') {
          const localOverrides = this.getFallbackCache();
          const merged = { ...localOverrides, ...cloudOverrides };
          localStorage.setItem('SPORTS_ADMIN_CACHE', JSON.stringify(merged));
          hasUpdates = true;

          // Sync into IndexedDB
          try {
            const db = await openDB();
            const tx = db.transaction(STORE_MATCHES, 'readwrite');
            const store = tx.objectStore(STORE_MATCHES);
            Object.values(merged).forEach(item => {
              store.put(item);
            });
          } catch {}
        }

        if (data.mediaSummary && typeof data.mediaSummary === 'object') {
          const localMedia = this.getMediaCache();
          const mergedMedia = { ...localMedia, ...data.mediaSummary };
          localStorage.setItem('SPORTS_MEDIA_CACHE', JSON.stringify(mergedMedia));
          hasUpdates = true;
        }

        return hasUpdates;
      } catch (err) {
        console.warn('AdminStorage: Cloud sync pull error:', err);
        return false;
      }
    },

    // Export entire overrides & media backup as JSON file
    exportBackupJson() {
      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        cloudSyncUrl: this.getCloudSyncUrl(),
        overrides: this.getFallbackCache(),
        mediaSummary: this.getMediaCache()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sports_meet_admin_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },

    // Import overrides & media backup JSON from another device
    async importBackupJson(jsonString) {
      try {
        const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        if (data.overrides) {
          const local = this.getFallbackCache();
          const merged = { ...local, ...data.overrides };
          localStorage.setItem('SPORTS_ADMIN_CACHE', JSON.stringify(merged));
          const db = await openDB();
          const tx = db.transaction(STORE_MATCHES, 'readwrite');
          const store = tx.objectStore(STORE_MATCHES);
          Object.values(merged).forEach(item => store.put(item));
        }
        if (data.mediaSummary) {
          const localMedia = this.getMediaCache();
          const mergedMedia = { ...localMedia, ...data.mediaSummary };
          localStorage.setItem('SPORTS_MEDIA_CACHE', JSON.stringify(mergedMedia));
        }
        if (data.cloudSyncUrl) {
          this.setCloudSyncUrl(data.cloudSyncUrl);
        }
        await this.pushToCloud();
        return true;
      } catch (err) {
        console.error('Import error:', err);
        return false;
      }
    },

    // Get all overrides for matches (scores, status, winners)
    async getAllOverrides() {
      // Background pull from cloud if configured
      this.pullFromCloud().catch(() => {});

      try {
        const db = await openDB();
        return new Promise(resolve => {
          const tx = db.transaction(STORE_MATCHES, 'readonly');
          const store = tx.objectStore(STORE_MATCHES);
          const req = store.getAll();
          req.onsuccess = () => {
            const map = {};
            (req.result || []).forEach(item => {
              map[item.id] = item;
            });
            // Merge with local storage fallback
            const fallback = this.getFallbackCache();
            const merged = { ...fallback, ...map };
            localStorage.setItem('SPORTS_ADMIN_CACHE', JSON.stringify(merged));
            resolve(merged);
          };
          req.onerror = () => resolve(this.getFallbackCache());
        });
      } catch (err) {
        return this.getFallbackCache();
      }
    },

    getFallbackCache() {
      try {
        return JSON.parse(localStorage.getItem('SPORTS_ADMIN_CACHE') || '{}');
      } catch {
        return {};
      }
    },

    // Save a match override (scores, live status, winner, delay)
    async saveMatchOverride(sport, matchNo, data) {
      const id = `${sport}_${matchNo}`;
      const record = { id, sport, matchNo: parseInt(matchNo), updatedAt: new Date().toISOString(), ...data };
      
      // Update localStorage cache
      const cache = this.getFallbackCache();
      cache[id] = record;
      localStorage.setItem('SPORTS_ADMIN_CACHE', JSON.stringify(cache));

      // Push to cloud in background for instant multi-device reflection
      this.pushToCloud().catch(() => {});

      try {
        const db = await openDB();
        return new Promise(resolve => {
          const tx = db.transaction(STORE_MATCHES, 'readwrite');
          tx.objectStore(STORE_MATCHES).put(record);
          tx.oncomplete = () => resolve(record);
          tx.onerror = () => resolve(record);
        });
      } catch (e) {
        return record;
      }
    },

    // Remove an override (reset match to original sheet data)
    async deleteMatchOverride(sport, matchNo) {
      const id = `${sport}_${matchNo}`;
      const cache = this.getFallbackCache();
      delete cache[id];
      localStorage.setItem('SPORTS_ADMIN_CACHE', JSON.stringify(cache));

      // Push to cloud in background
      this.pushToCloud().catch(() => {});

      try {
        const db = await openDB();
        const tx = db.transaction(STORE_MATCHES, 'readwrite');
        tx.objectStore(STORE_MATCHES).delete(id);
      } catch {}
    },

    // Get media fallback cache from localStorage
    getMediaCache() {
      try {
        return JSON.parse(localStorage.getItem('SPORTS_MEDIA_CACHE') || '{}');
      } catch {
        return {};
      }
    },

    // Get media (photos & videos) for a particular match
    async getMatchMedia(sport, matchNo) {
      const id = `${sport}_${matchNo}`;
      try {
        const db = await openDB();
        return new Promise(resolve => {
          const tx = db.transaction(STORE_MEDIA, 'readonly');
          const req = tx.objectStore(STORE_MEDIA).get(id);
          req.onsuccess = () => {
            if (req.result && req.result.media && req.result.media.length) {
              resolve(req.result.media);
            } else {
              const cached = this.getMediaCache()[id];
              resolve(cached?.mediaList || []);
            }
          };
          req.onerror = () => {
            const cached = this.getMediaCache()[id];
            resolve(cached?.mediaList || []);
          };
        });
      } catch {
        const cached = this.getMediaCache()[id];
        return cached?.mediaList || [];
      }
    },

    // Save media array for a match
    async saveMatchMedia(sport, matchNo, mediaList) {
      const id = `${sport}_${matchNo}`;
      const firstPhoto = (mediaList || []).find(m => m.type === 'photo');
      const previewSrc = firstPhoto ? firstPhoto.src : ((mediaList && mediaList[0]) ? mediaList[0].src : null);

      // Immediately sync to localStorage so public site sees it in real time
      const cache = this.getMediaCache();
      cache[id] = {
        id,
        sport,
        matchNo: parseInt(matchNo),
        count: (mediaList || []).length,
        photos: (mediaList || []).filter(m => m.type === 'photo').length,
        videos: (mediaList || []).filter(m => m.type === 'video').length,
        previewSrc: previewSrc,
        mediaList: mediaList || []
      };
      localStorage.setItem('SPORTS_MEDIA_CACHE', JSON.stringify(cache));

      // Push to cloud in background
      this.pushToCloud().catch(() => {});

      try {
        const db = await openDB();
        return new Promise(resolve => {
          const tx = db.transaction(STORE_MEDIA, 'readwrite');
          tx.objectStore(STORE_MEDIA).put({
            id,
            sport,
            matchNo: parseInt(matchNo),
            updatedAt: new Date().toISOString(),
            media: mediaList
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(true);
        });
      } catch {
        return true;
      }
    },

    // Get media counts & preview thumbnails map { "Badminton_1": { count: 3, previewSrc: "..." }, ... }
    async getMediaSummary() {
      // Background pull from cloud if configured
      this.pullFromCloud().catch(() => {});

      try {
        const db = await openDB();
        return new Promise(resolve => {
          const tx = db.transaction(STORE_MEDIA, 'readonly');
          const req = tx.objectStore(STORE_MEDIA).getAll();
          req.onsuccess = () => {
            const summary = this.getMediaCache();
            (req.result || []).forEach(item => {
              if (item.media && item.media.length) {
                const firstPhoto = item.media.find(m => m.type === 'photo');
                summary[item.id] = {
                  id: item.id,
                  sport: item.sport,
                  matchNo: parseInt(item.matchNo),
                  count: item.media.length,
                  photos: item.media.filter(m => m.type === 'photo').length,
                  videos: item.media.filter(m => m.type === 'video').length,
                  previewSrc: firstPhoto ? firstPhoto.src : item.media[0].src,
                  mediaList: item.media
                };
              }
            });
            localStorage.setItem('SPORTS_MEDIA_CACHE', JSON.stringify(summary));
            resolve(summary);
          };
          req.onerror = () => resolve(this.getMediaCache());
        });
      } catch {
        return this.getMediaCache();
      }
    }
  };
})();
