import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { app } from '../services/firebaseConfig';

export function useLicense() {
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', auth.currentUser.uid);
    
    const unsubscribeUser = onSnapshot(userRef, async (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const licenseKey = userData.licenseKey;
        
        if (licenseKey) {
          const licenseRef = doc(db, 'licenses', licenseKey);
          try {
             const licenseSnap = await getDoc(licenseRef);
             if (licenseSnap.exists()) {
               setLicense({ key: licenseKey, ...licenseSnap.data() });
             } else {
               setLicense({ key: licenseKey, status: 'invalid', modules: [] });
               setError("Lisans anahtarı geçersiz.");
             }
          } catch(err) {
             setError(err.message);
          }
        } else {
          setLicense({ status: 'no_key', modules: [] });
        }
      } else {
        setLicense({ status: 'no_user_doc', modules: [] });
      }
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribeUser();
  }, []);

  const canAccess = (path) => {
    if (!license) return false;
    if (license.status === 'revoked') return false; // Patron iptal ettiyse HİÇBİR ŞEYE giremez
    if (path === '/dashboard' || path === '/profile') return true;
    
    const modules = license.modules || [];
    return modules.includes(path) || modules.includes('*');
  };

  return { license, loading, error, canAccess };
}
