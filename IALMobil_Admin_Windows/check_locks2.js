import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

import { firebaseConfig } from "./src/services/firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'student_daily_locks'));
  snap.forEach(d => {
    console.log("Daily Lock ID:", d.id, d.data());
  });
}
check().then(() => process.exit(0)).catch(console.error);
