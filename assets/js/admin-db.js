/**
 * 28th H.P. Inter-Polytechnic Sports Meet 2026
 * Admin IndexedDB Storage Manager for Match Scores, Live Status & Media
 */
(function() {
  const DB_NAME = 'GPSportsMeetAdminDB';
  const DB_VERSION = 1;
  const STORE_MATCHES = 'matchOverrides';
  const STORE_MEDIA = 'matchMedia';

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
    // Get all overrides for matches (scores, status, winners)
    async getAllOverrides() {
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
            // Also sync to localStorage for ultra-fast synchronous lookup in public views
            localStorage.setItem('SPORTS_ADMIN_CACHE', JSON.stringify(map));
            resolve(map);
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
