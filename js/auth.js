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

function showError(msg) {
  statusEl.textContent = msg;
  statusEl.className = 'err';
  retryBtn.style.display = 'inline-block';
}

function goHome() {
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

async function doAuth() {
  if (!auth) {
    showError('Unable to sign in. Please reload and try again.');
    return;
  }

  statusEl.textContent = 'Signing in with Google…';

  // 1. Check if returning from a redirect
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      goHome();
      return;
    }
  } catch (e) {
    console.warn('getRedirectResult error:', e.message);
  }

  // 2. Try popup (works in browsers, may fail in PWA WebView)
  try {
    const popupPromise = auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    popupPromise.catch(() => {}); // suppress unhandled rejection if timeout wins
    const result = await Promise.race([
      popupPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('popup_timeout')), 4000))
    ]);
    if (result && result.user) {
      goHome();
      return;
    }
  } catch (e) {
    console.warn('Popup failed:', e.message);
  }

  // 3. Fallback to redirect
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
  doAuth();
});

cancelLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = new URL('index.html#stats', window.location.href).href;
});

// Show cancel link after a short delay
setTimeout(() => { cancelLink.style.display = 'inline'; }, 2000);

if (auth) doAuth();
