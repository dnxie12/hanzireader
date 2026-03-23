// sync.js — Optional Firebase cloud sync (lazy-loaded, opt-in)

const Sync = (() => {
  // Injected by GitHub Actions at deploy time — do not hardcode
  const FIREBASE_CONFIG = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__"
  };

  const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const SDK_SCRIPTS = [
    'firebase-app-compat.js',
    'firebase-auth-compat.js',
    'firebase-firestore-compat.js'
  ];

  let db = null;
  let auth = null;
  let user = null;
  let syncing = false;
  let locked = false;
  let deferredPush = false;
  let sdkPromise = null;
  let visibilityListenerRegistered = false;
  let authChangeCallbacks = [];

  function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  // --- SDK Loading ---
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function isConfigured() {
    return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('__');
  }

  async function _loadSDKInternal() {
    if (!isConfigured()) {
      console.warn('Firebase config not injected — sync disabled');
      return;
    }
    for (const name of SDK_SCRIPTS) {
      await loadScript(SDK_BASE + name);
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  function loadSDK() {
    if (db) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = _loadSDKInternal().catch(e => {
      sdkPromise = null; // allow retry on failure
      throw e;
    });
    return sdkPromise;
  }

  function registerVisibilityListener() {
    if (visibilityListenerRegistered) return;
    visibilityListenerRegistered = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && user) {
        if (locked) {
          deferredPush = true;
        } else {
          push().catch(e => console.warn('Sync push on hide failed:', e));
        }
      }
    });
  }

  // --- Init ---
  function init() {
    const settings = Storage.getSettings();
    if (!settings.syncEnabled) return;

    loadSDK().then(() => {
      if (!auth) return;
      registerVisibilityListener();
      auth.onAuthStateChanged(u => {
        user = u;
        authChangeCallbacks.forEach(fn => fn(u));
        if (u) pull().catch(e => console.warn('Sync pull on init failed:', e));
      });
    }).catch(e => console.warn('Firebase SDK load failed:', e));
  }

  // --- SW credential relay (PWA auth flow) ---
  function waitForSWCredential(timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener('message', handler);
        reject(new Error('Sign-in timed out. Please try again.'));
      }, timeoutMs);

      function handler(event) {
        if (!event.data || event.data.type !== 'AUTH_CREDENTIAL') return;
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve({ idToken: event.data.idToken, accessToken: event.data.accessToken });
      }

      navigator.serviceWorker.addEventListener('message', handler);
    });
  }

  // --- Auth ---
  async function signIn() {
    await loadSDK();
    if (!auth) throw new Error('Firebase not configured');
    registerVisibilityListener();

    if (isPWA()) {
      // Open auth.html in system browser; it completes OAuth and relays
      // the Google credential back through the service worker.
      if (!navigator.serviceWorker) {
        throw new Error('Service worker not available. Please reload and try again.');
      }
      await navigator.serviceWorker.ready;

      // Start listening before opening the window to avoid a race
      const credentialPromise = waitForSWCredential(60000);

      const win = window.open(new URL('auth.html', window.location.href).href);
      if (!win) {
        throw new Error('Could not open sign-in page. Please check your popup blocker settings.');
      }

      const { idToken, accessToken } = await credentialPromise;

      const credential = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken);
      const result = await auth.signInWithCredential(credential);
      user = result.user;
      Storage.updateSettings({ syncEnabled: true });
      authChangeCallbacks.forEach(fn => fn(user));
      await pull();
      return user;
    }

    // Normal browser flow — popup works fine
    const result = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    user = result.user;
    Storage.updateSettings({ syncEnabled: true });
    authChangeCallbacks.forEach(fn => fn(user));
    await pull();
    return user;
  }

  async function signOut() {
    if (!auth) return;
    await auth.signOut();
    user = null;
    Storage.updateSettings({ syncEnabled: false, lastSyncTime: null });
    authChangeCallbacks.forEach(fn => fn(null));
  }

  // --- Firestore doc ref ---
  function docRef() {
    if (!db || !user) return null;
    return db.collection('users').doc(user.uid).collection('data').doc('v1');
  }

  // --- Push ---
  async function push() {
    if (syncing || !db || !user) return;
    syncing = true;
    try {
      const ref = docRef();
      if (!ref) return;
      await ref.set({
        srs: Storage.getSRS(),
        progress: Storage.getProgress(),
        lastSync: firebase.firestore.FieldValue.serverTimestamp(),
        schemaVersion: 1
      });
      Storage.updateSettings({ lastSyncTime: new Date().toISOString() });
    } finally {
      syncing = false;
    }
  }

  // --- Pull + Merge ---
  async function pull() {
    if (syncing || !db || !user) return;
    syncing = true;
    try {
      const ref = docRef();
      if (!ref) return;
      const snap = await ref.get();
      if (!snap.exists) {
        // First sync — push local state up
        await pushInternal();
        return;
      }

      const remote = snap.data();
      const remoteSRS = remote.srs || {};
      const remoteProgress = remote.progress || {};

      // Validate remote data before merging
      if (Object.keys(remoteSRS).length > 0 && !Storage.validateSRS(remoteSRS)) {
        console.warn('Remote SRS data failed validation, skipping merge');
        return;
      }
      if (Object.keys(remoteProgress).length > 0 && !Storage.validateProgress(remoteProgress)) {
        console.warn('Remote progress data failed validation, skipping merge');
        return;
      }

      const localSRS = Storage.getSRS();
      const localProgress = Storage.getProgress();

      const mergedSRS = mergeSRS(localSRS, remoteSRS);
      const mergedProgress = mergeProgress(localProgress, remoteProgress);

      Storage.saveSRS(mergedSRS);
      Storage.saveProgress(mergedProgress);
      Storage.updateSettings({ lastSyncTime: new Date().toISOString() });

      // Push merged state back
      await pushInternal();
    } finally {
      syncing = false;
    }
  }

  // Internal push (no syncing guard — called from within pull)
  async function pushInternal() {
    const ref = docRef();
    if (!ref) return;
    await ref.set({
      srs: Storage.getSRS(),
      progress: Storage.getProgress(),
      lastSync: firebase.firestore.FieldValue.serverTimestamp(),
      schemaVersion: 1
    });
  }

  // --- Merge: SRS cards ---
  function mergeSRS(local, remote) {
    const merged = {};
    const allChars = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const char of allChars) {
      const l = local[char];
      const r = remote[char];

      if (!r) { merged[char] = l; continue; }
      if (!l) { merged[char] = r; continue; }

      // Both exist — most recent last_review wins
      const lTime = l.last_review ? new Date(l.last_review).getTime() : 0;
      const rTime = r.last_review ? new Date(r.last_review).getTime() : 0;

      if (lTime > rTime) {
        merged[char] = l;
      } else if (rTime > lTime) {
        merged[char] = r;
      } else {
        // Tie-break: higher reps
        merged[char] = (l.reps || 0) >= (r.reps || 0) ? l : r;
      }
    }

    return merged;
  }

  // --- Merge: Progress ---
  function mergeProgress(local, remote) {
    const merged = JSON.parse(JSON.stringify(local)); // deep copy local as base

    // Daily stats: per-date, Math.max of each counter
    if (remote.daily) {
      if (!merged.daily) merged.daily = {};
      for (const [date, rStats] of Object.entries(remote.daily)) {
        if (!merged.daily[date]) {
          merged.daily[date] = rStats;
        } else {
          const m = merged.daily[date];
          m.reviews = Math.max(m.reviews || 0, rStats.reviews || 0);
          m.newCards = Math.max(m.newCards || 0, rStats.newCards || 0);
          m.correct = Math.max(m.correct || 0, rStats.correct || 0);
          m.timeMs = Math.max(m.timeMs || 0, rStats.timeMs || 0);
          m.snippetsRead = Math.max(m.snippetsRead || 0, rStats.snippetsRead || 0);
        }
      }
    }

    // Streak: reconstruct from merged daily data
    merged.streak = reconstructStreak(merged.daily || {});

    // Settings: last-write-wins using settingsModified
    if (remote.settings) {
      const localMod = local.settings?.settingsModified ? new Date(local.settings.settingsModified).getTime() : 0;
      const remoteMod = remote.settings?.settingsModified ? new Date(remote.settings.settingsModified).getTime() : 0;

      if (remoteMod > localMod) {
        // Take remote settings but preserve local sync-meta and max of currentIndex
        const preserve = {
          syncEnabled: merged.settings?.syncEnabled,
          lastSyncTime: merged.settings?.lastSyncTime,
          settingsModified: remote.settings.settingsModified,
          currentIndex: Math.max(local.settings?.currentIndex || 0, remote.settings?.currentIndex || 0)
        };
        merged.settings = { ...remote.settings, ...preserve };
      } else {
        // Local settings win, but still take max of currentIndex
        merged.settings.currentIndex = Math.max(
          merged.settings?.currentIndex || 0,
          remote.settings?.currentIndex || 0
        );
      }
    }

    // Reading flags: set union
    if (remote.readingFlags) {
      const localFlags = new Set(merged.readingFlags || []);
      for (const f of remote.readingFlags) localFlags.add(f);
      merged.readingFlags = [...localFlags];
    }

    // Read history: per-snippet, most recent date wins
    if (remote.readHistory) {
      if (!merged.readHistory) merged.readHistory = {};
      for (const [id, date] of Object.entries(remote.readHistory)) {
        if (!merged.readHistory[id] || date > merged.readHistory[id]) {
          merged.readHistory[id] = date;
        }
      }
    }

    return merged;
  }

  function reconstructStreak(daily) {
    const today = new Date().toISOString().slice(0, 10);
    let current = 0;
    let longest = 0;
    let checkDate = new Date();

    // Scan backward from today
    for (let i = 0; i < 3650; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      const d = daily[dateStr];
      if (d && ((d.reviews || 0) > 0 || (d.snippetsRead || 0) > 0)) {
        current++;
      } else if (i === 0) {
        // Today has no activity yet — check from yesterday
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      } else {
        break;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Find longest by scanning all dates
    const dates = Object.keys(daily).filter(d => {
      const s = daily[d];
      return (s.reviews || 0) > 0 || (s.snippetsRead || 0) > 0;
    }).sort();

    let run = 0;
    for (let i = 0; i < dates.length; i++) {
      if (i === 0) { run = 1; }
      else {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diffDays = Math.round((curr - prev) / 86400000);
        run = diffDays === 1 ? run + 1 : 1;
      }
      if (run > longest) longest = run;
    }

    longest = Math.max(longest, current);

    const lastDate = current > 0 ? today : (dates.length > 0 ? dates[dates.length - 1] : null);

    return { current, longest, lastDate };
  }

  // --- Lock/Unlock (study session guard) ---
  function lock() {
    locked = true;
  }

  function unlock() {
    locked = false;
    if (user) {
      deferredPush = false;
      push().catch(e => console.warn('Sync push after unlock failed:', e));
    }
  }

  // --- Manual sync ---
  async function syncNow() {
    await pull();
  }

  // --- Public getters ---
  function getUser() { return user; }
  function isEnabled() { return !!user; }
  function onAuthChange(fn) { authChangeCallbacks.push(fn); }

  return {
    init, signIn, signOut,
    push, pull, syncNow,
    lock, unlock,
    getUser, isEnabled, onAuthChange,
    // Exposed for testing
    _mergeSRS: mergeSRS,
    _mergeProgress: mergeProgress
  };
})();
