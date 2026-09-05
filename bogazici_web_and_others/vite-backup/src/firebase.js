import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBweBGe__mv1KYPI4PmUjtXY562mjiosbU",
  authDomain: "bgz-mobil.firebaseapp.com",
  databaseURL: "https://bgz-mobil-default-rtdb.firebaseio.com",
  projectId: "bgz-mobil",
  storageBucket: "bgz-mobil.firebasestorage.app",
  messagingSenderId: "945060715279",
  appId: "1:945060715279:web:0b1f92d57f7f3797e6fc7a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
});
export const rtdb = getDatabase(app);

// Initialize anonymous auth so that public queries work against security rules
signInAnonymously(auth).catch((err) => console.log("Auth warning:", err.message));
