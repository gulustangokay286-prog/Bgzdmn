import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";

import { firebaseConfig } from "./src/services/firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'students'));
  let count = 0;
  snap.forEach(d => {
    const data = d.data();
    if (data.hardwareId) {
       console.log("Locked Student ID:", d.id, "hardwareId:", data.hardwareId);
       count++;
    }
  });
  console.log("Total locked students:", count);
  
  // also get the users collection to see if 38977107170 exists
  const uSnap = await getDocs(collection(db, 'users'));
  uSnap.forEach(d => {
     const data = d.data();
     const tc = data.tc_kimlik || data.tcKimlik || data.tcNo || data.tc || "";
     if (String(tc).includes('7170')) {
        console.log("Found User ID in users col:", d.id, "TC:", tc, "Name:", data.full_name || data.name);
     }
  });
}
check().then(() => process.exit(0)).catch(console.error);
