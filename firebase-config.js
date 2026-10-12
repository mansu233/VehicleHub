// Paste your Firebase web app settings here (Firebase console > Project settings > Your apps).
// Enable Authentication > Email/Password and create a Realtime Database first.
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID"
};
// Database rules (Realtime Database > Rules):
// { "rules": { "manskit-backup": { "$uid": { ".read": "auth.uid === $uid", ".write": "auth.uid === $uid" } } } }
