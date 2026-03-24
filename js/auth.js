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
let authTimeout = null;

// Detect if we're returning from a signInWithRedirect (survives cross-origin redirects)
let isRedirectReturn = localStorage.getItem('auth_redirect_pending') === '1';
localStorage.removeItem('auth_redirect_pending');

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

// Wait for Firebase auth state. Stays subscribed for the full timeout
// (doesn't bail on the initial null — Firebase may fire again with the
// user after it finishes processing the redirect result).
function waitForAuthState(timeoutMs) {
  // Clean up any previous wait
  if (authTimeout) { clearTimeout(authTimeout); authTimeout = null; }
  if (unsubAuth) { unsubAuth(); unsubAuth = null; }

  return new Promise(resolve => {
    let settled = false;
    authTimeout = setTimeout(() => {
      settled = true;
      if (unsubAuth) { unsubAuth(); unsubAuth = null; }
      authTimeout = null;
      resolve(false);
    }, timeoutMs);
    unsubAuth = auth.onAuthStateChanged(user => {
      if (user && !settled) {
        settled = true;
        if (authTimeout) { clearTimeout(authTimeout); authTimeout = null; }
        if (unsubAuth) { unsubAuth(); unsubAuth = null; }
        goHome();
        resolve(true);
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

  // Start listening for auth state immediately (catches changes during getRedirectResult)
  const waitTime = isRedirectReturn ? 8000 : 3000;
  const authPromise = waitForAuthState(waitTime);

  // Try getRedirectResult in parallel with the listener
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

  if (auth.currentUser) {
    goHome();
    return;
  }

  // Wait for the listener (already been running since before getRedirectResult)
  const restored = await authPromise;
  if (restored || navigating) return;

  // On redirect return, don't start another redirect — show error instead
  if (isRedirectReturn) {
    showError('Sign-in did not complete. Please try again.');
    return;
  }

  // Try popup (works in browsers, may fail in PWA WebView)
  try {
    const popupPromise = auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    popupPromise.catch(() => {});
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

  // Fallback to redirect — set flag so we know we're returning
  if (navigating) return;
  try {
    localStorage.setItem('auth_redirect_pending', '1');
    await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
  } catch (e) {
    localStorage.removeItem('auth_redirect_pending');
    showError('Sign-in failed. Please try again.');
  }
}

retryBtn.addEventListener('click', () => {
  statusEl.textContent = 'Signing in with Google…';
  statusEl.className = '';
  retryBtn.style.display = 'none';
  navigating = false;
  isRedirectReturn = false;
  doAuth();
});

cancelLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = new URL('index.html#stats', window.location.href).href;
});

setTimeout(() => { cancelLink.style.display = 'inline'; }, 2000);

if (auth) doAuth();
