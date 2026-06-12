// Firebase web app config — paste yours from:
//   Firebase Console → Project settings → General → Your apps → Web app
// This config is public by design; security is enforced by firestore.rules.
// Until it's filled in, the app runs in local-only mode (localStorage).
export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "PASTE_ME.firebaseapp.com",
  projectId: "PASTE_ME",
  storageBucket: "PASTE_ME.appspot.com",
  messagingSenderId: "PASTE_ME",
  appId: "PASTE_ME",
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "PASTE_ME";
