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

export const isFirebaseConfigured = firebaseConfig.apiKey !== "PASTE_ME";
