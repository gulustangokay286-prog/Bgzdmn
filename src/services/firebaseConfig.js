import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

export const firebaseConfig = {
  apiKey: "AIzaSyBweBGe__mv1KYPI4PmUjtXY562mjiosbU",
  authDomain: "bgz-mobil.firebaseapp.com",
  databaseURL: "https://bgz-mobil-default-rtdb.firebaseio.com",
  projectId: "bgz-mobil",
  storageBucket: "bgz-mobil.firebasestorage.app",
  messagingSenderId: "945060715279",
  appId: "1:945060715279:web:0b1f92d57f7f3797e6fc7a"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
});
/**
 * Oturum kaliciligi.
 *
 * Electron'da pencere `nodeIntegration: true` ile acildigi icin Firebase ortami
 * tarayici olarak taniyamayip bellek kaliciligina dusebiliyor; o durumda
 * uygulama her kapanista oturumu unutuyor ("Beni hatirla" calismiyor gorunur).
 * Kalicilik bu yuzden acikca IndexedDB -> localStorage sirasiyla verilir.
 */
const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  } catch {
    // Auth zaten baslatildiysa (HMR / cift import) mevcut ornek dondurulur.
    return getAuth(app);
  }
})();
const storage = getStorage(app);
const rtdb = getDatabase(app);

export const mapSdkToRest = (docSnapshot) => {
  const data = docSnapshot.data();
  const fields = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: String(value) };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value && typeof value === 'object') {
      if (value.toDate) { 
        fields[key] = { timestampValue: value.toDate().toISOString() };
      } else {
        fields[key] = { stringValue: JSON.stringify(value) };
      }
    }
  }

  return {
    name: `projects/bgz-mobil/databases/(default)/documents/${docSnapshot.ref.path}`,
    fields
  };
};

export const unwrapRestPayload = (fieldsObj) => {
  const data = {};
  for (const [key, value] of Object.entries(fieldsObj)) {
    if (value.stringValue !== undefined) data[key] = value.stringValue;
    else if (value.integerValue !== undefined) data[key] = Number(value.integerValue);
    else if (value.doubleValue !== undefined) data[key] = Number(value.doubleValue);
    else if (value.booleanValue !== undefined) data[key] = value.booleanValue;
    else if (value.timestampValue !== undefined) data[key] = new Date(value.timestampValue);
  }
  return data;
};

export { db, app, auth, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, storage, rtdb };
