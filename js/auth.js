const statusEl = document.getElementById('status');
const retryBtn = document.getElementById('retry');
const cancelLink = document.getElementById('cancel');

const FIREBASE_CONFIG = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
};

let navigating = false;
let unsubAuth = null;

function showError(msg) {
  statusEl.textContent = msg;
  statusEl.className = 'err';
  retryBtn.style.display = 'inline-block';
}

function goHome() {
  if (navigating) return;
  navigating = true;
  statusEl.textContent = 'Sign-in complete! Returning to app…';
  statusEl.className = 'ok';
  retryBtn.style.display = 'none';
  cancelLink.style.display = 'none';
  window.location.href = new URL('index.html#stats', window.location.href).href;
}

let auth = null;
try {
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('__')) {
    showError('App not configured for sign-in.');
  } else if (typeof firebase === 'undefined') {
    showError('Firebase SDK failed to load.');
  } else {
    firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
  }
} catch (e) {
  showError('Init error: ' + e.message);
}

// Wait for Firebase to restore auth state from IndexedDB.
// Returns true if a user was found, false on timeout.
function waitForAuthState(timeoutMs) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => { resolve(false); }, timeoutMs);
    if (unsubAuth) unsubAuth();
    unsubAuth = auth.onAuthStateChanged(user => {
      clearTimeout(timeout);
      if (user) {
        goHome();
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

async function doAuth() {
  if (!auth) {
    showError('Unable to sign in. Please reload and try again.');
    return;
  }

  statusEl.textContent = 'Signing in with Google…';

  // 1. Try getRedirectResult (works when session storage survives the redirect)
  try {
    const result = await auth.getRedirectResult();
    if (navigating) return;
    if (result && result.user) {
      goHome();
      return;
    }
  } catch (e) {
    console.warn('getRedirectResult error:', e.message);
  }

  // 2. Wait for auth state from IndexedDB (catches redirect sign-in when
  //    getRedirectResult fails, which is common in iOS WKWebView)
  if (auth.currentUser) {
    goHome();
    return;
  }
  const restored = await waitForAuthState(3000);
  if (restored || navigating) return;

  // 3. Try popup (works in browsers, may fail in PWA WebView)
  try {
    const popupPromise = auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    popupPromise.catch(() => {}); // suppress unhandled rejection if timeout wins
    const result = await Promise.race([
      popupPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('popup_timeout')), 4000))
    ]);
    if (navigating) return;
    if (result && result.user) {
      goHome();
      return;
    }
  } catch (e) {
    console.warn('Popup failed:', e.message);
  }

  // 4. Fallback to redirect
  if (navigating) return;
  try {
    await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
  } catch (e) {
    showError('Sign-in failed. Please try again.');
  }
}

retryBtn.addEventListener('click', () => {
  statusEl.textContent = 'Signing in with Google…';
  statusEl.className = '';
  retryBtn.style.display = 'none';
  navigating = false;
  doAuth();
});

cancelLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = new URL('index.html#stats', window.location.href).href;
});

// Show cancel link after a short delay
setTimeout(() => { cancelLink.style.display = 'inline'; }, 2000);

if (auth) doAuth();
