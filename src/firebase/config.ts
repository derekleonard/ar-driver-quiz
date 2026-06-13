// Firebase web app config — paste yours from:
//   Firebase Console → Project settings → General → Your apps → Web app
// This config is public by design; security is enforced by firestore.rules.
// Until it's filled in, the app runs in local-only mode (localStorage).
export const firebaseConfig = {
  apiKey: "AIzaSyC6KNFV6M2fYGkWFoIMsbesb9KGhIcxx_Y",
  authDomain: "ar-driver-quiz.firebaseapp.com",
  projectId: "ar-driver-quiz",
  storageBucket: "ar-driver-quiz.firebasestorage.app",
  messagingSenderId: "581493540665",
  appId: "1:581493540665:web:8795d2300e6182a86a0ae8",
};

// In dev, default to LOCAL mode so `npm run dev` can never write the
// production Firestore by accident (StrictMode double-invokes effects).
// Opt in explicitly when cloud behavior is what you're testing:
//   VITE_USE_EMULATOR=1 npm run dev   (cloud code against the local emulator)
//   VITE_USE_CLOUD=1 npm run dev      (the real production project — careful)
export const isFirebaseConfigured =
  firebaseConfig.apiKey !== "PASTE_ME" &&
  (!import.meta.env.DEV ||
    !!import.meta.env.VITE_USE_EMULATOR ||
    !!import.meta.env.VITE_USE_CLOUD);
