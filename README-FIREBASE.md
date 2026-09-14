# Cloud Backup with Firebase Realtime Database

MANSKIT Vehicle Hub stores everything on your device (localStorage), which
means a new phone, a cleared browser, or a reinstall loses your data. This
optional cloud backup fixes that using **Firebase Realtime Database** (the
free tier is plenty for this app).

Unlike the previous version, you don't paste any URL into the app —
you configure Firebase **once** by editing a file, and the app handles the
rest through the official Firebase SDK.

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click **Add project** and finish the wizard (Google Analytics is optional).

## 2. Turn on Realtime Database
1. Left sidebar > **Build > Realtime Database > Create Database**.
2. Pick any region.
3. Choose **Start in test mode** for now (see the security note below).

## 3. Register a Web App and copy the config
1. In Project Settings (gear icon, top left) > **General** tab.
2. Under "Your apps", click the **Web** icon (`</>`) to register a new web app.
3. Give it any nickname and finish. Firebase will show you a config object
   that looks like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "manskit-hub.firebaseapp.com",
  databaseURL: "https://manskit-hub-default-rtdb.firebaseio.com",
  projectId: "manskit-hub",
  storageBucket: "manskit-hub.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 4. Paste it into the app
Open **`firebase-config.js`** in the MANSKIT folder and replace the
placeholder object with the one Firebase gave you (keep the variable name
`FIREBASE_CONFIG`). Save the file.

That's it — no typing anything into the app itself. Open MANSKIT's
**Settings > Cloud Backup**, and it will now show **"Configured"** with
working **Backup Now** / **Restore from Cloud** buttons.

## 5. Secure your database (recommended)
Test mode is wide open to anyone who has your project's config. Once your
backup is working, go to **Realtime Database > Rules** and lock it down,
for example:

```json
{
  "rules": {
    "manskit-backup": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Using `auth != null` requires signing users in (e.g. Firebase
Anonymous Auth) — for a single personal backup, an easier middle ground is
restricting rules to a long, secret path name instead of `manskit-backup`
that only you know, alongside test-mode rules.

## Notes
- The app loads the Firebase SDK from Google's CDN only when you tap
  **Backup Now** or **Restore from Cloud** — it isn't loaded otherwise, so
  the app still works fully offline day-to-day.
- Backups are manual — the app doesn't silently send data anywhere on its
  own.
- Photos are stored as compressed images inside the backup, so a vehicle
  with a lot of photos makes for a larger (but still normally fine)
  backup payload.
