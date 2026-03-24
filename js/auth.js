const statusEl = document.getElementById('status');
const retryBtn = document.getElementById('retry');
const cancelLink = document.getElementById('cancel');

const GOOGLE_CLIENT_ID = '__GOOGLE_WEB_CLIENT_ID__';

const FIREBASE_CONFIG = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
};

let navigating = false;

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

// --- Start OAuth: redirect to Google ---
function startOAuth() {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('__')) {
    showError('App not configured for sign-in.');
    return;
  }

  const state = crypto.randomUUID();
  localStorage.setItem('oauth_state', state);

  const redirectUri = window.location.href.split('?')[0].split('#')[0];

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    state: state,
    nonce: crypto.randomUUID(),
    prompt: 'select_account'
  });

  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// --- Handle return from Google with id_token in hash ---
async function handleReturn(idToken, state) {
  // Clear hash immediately to prevent token leaking in URL
  history.replaceState(null, '', window.location.pathname);

  // Verify CSRF state
  const savedState = localStorage.getItem('oauth_state');
  localStorage.removeItem('oauth_state');

  if (!state || state !== savedState) {
    showError('Invalid auth state. Please try again.');
    return;
  }

  statusEl.textContent = 'Completing sign-in…';

  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('__')) {
    showError('App not configured for sign-in.');
    return;
  }
  if (typeof firebase === 'undefined') {
    showError('Firebase SDK failed to load.');
    return;
  }

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
    await auth.signInWithCredential(credential);
    goHome();
  } catch (e) {
    showError('Sign-in failed: ' + e.message);
  }
}

// --- Route based on URL hash ---
const hashParams = new URLSearchParams(window.location.hash.substring(1));
const idToken = hashParams.get('id_token');

if (idToken) {
  handleReturn(idToken, hashParams.get('state'));
} else if (hashParams.get('error')) {
  showError('Sign-in was cancelled or failed.');
} else {
  startOAuth();
}

// --- Retry / Cancel ---
retryBtn.addEventListener('click', () => {
  statusEl.textContent = 'Signing in with Google…';
  statusEl.className = '';
  retryBtn.style.display = 'none';
  navigating = false;
  startOAuth();
});

cancelLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = new URL('index.html#stats', window.location.href).href;
});

setTimeout(() => { if (!navigating) cancelLink.style.display = 'inline'; }, 2000);
