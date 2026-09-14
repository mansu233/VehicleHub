/* =========================================================================
   MANSKIT Vehicle Hub — Firebase Realtime Database Backup
   -------------------------------------------------------------------------
   Uses the official Firebase SDK (loaded from CDN on first use) together
   with the project config in firebase-config.js. Nothing to type into the
   app itself — just fill in firebase-config.js once with your project's
   config object. See README-FIREBASE.md for full setup steps.

   Data is stored at the Realtime Database path:  /manskit-backup
   ========================================================================= */

const FirebaseSync = {
  _app: null,
  _sdkLoadPromise: null,

  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined'
      && FIREBASE_CONFIG.apiKey
      && !FIREBASE_CONFIG.apiKey.startsWith('YOUR_')
      && FIREBASE_CONFIG.databaseURL
      && !FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT');
  },

  _loadSdk() {
    if (this._sdkLoadPromise) return this._sdkLoadPromise;
    this._sdkLoadPromise = new Promise((resolve, reject) => {
      if (window.firebase && window.firebase.database) { resolve(); return; }
      const scripts = [
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
      ];
      let loaded = 0;
      scripts.forEach(src => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { loaded++; if (loaded === scripts.length) resolve(); };
        s.onerror = () => reject(new Error('Could not load the Firebase SDK. Check your internet connection.'));
        document.head.appendChild(s);
      });
    });
    return this._sdkLoadPromise;
  },

  async _getApp() {
    if (!this.isConfigured()) {
      throw new Error('Firebase isn\'t configured yet. Edit firebase-config.js with your project\'s config first.');
    }
    await this._loadSdk();
    if (!this._app) {
      this._app = window.firebase.apps && window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(FIREBASE_CONFIG);
    }
    return this._app;
  },

  async backup(dataObj) {
    const app = await this._getApp();
    const payload = { ...dataObj, _meta: { updatedAt: new Date().toISOString(), source: 'manskit-vehicle-hub' } };
    await app.database().ref('manskit-backup').set(payload);
    return payload._meta.updatedAt;
  },

  async restore() {
    const app = await this._getApp();
    const snap = await app.database().ref('manskit-backup').once('value');
    const data = snap.val();
    if (!data || !data.vehicles) {
      throw new Error('No backup found in Firebase yet — run "Backup Now" first.');
    }
    delete data._meta;
    return data;
  }
};
