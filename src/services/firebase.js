import { db, collection, getDocs, doc, updateDoc, mapSdkToRest } from './firebaseConfig';

const EXTRA_TEACHERS = [
  { name: 'Seçil Özkan', branch: 'Görsel Sanatlar', contract_end: '06.11.2026', phone: '05466860719', email: 'secilozkan@corumbogazici.com' },
  { name: 'Mesut Çolak', branch: 'Matematik', contract_end: '01.09.2027', phone: '05550000001', email: 'mesutcolak@corumbogazici.com' },
  { name: 'Hasan Barış Karataş', branch: 'Biyoloji', contract_end: '01.09.2027', phone: '05550000002', email: 'hasanbaris@corumbogazici.com' },
  { name: 'Selim Kurtaran', branch: 'Fizik', contract_end: '30.06.2027', phone: '05550000003', email: 'selimkurtaran@corumbogazici.com' },
  { name: 'Oya Sadıç Erocağı', branch: 'İngilizce', contract_end: '01.09.2027', phone: '05550000004', email: 'oyasadic@corumbogazici.com' },
  { name: 'Mustafa Yalçın', branch: 'Matematik', contract_end: '01.09.2027', phone: '05550000005', email: 'mustafayalcin@corumbogazici.com' }
];

const makeTeacherRestDoc = (et) => ({
  name: 'projects/bgz-mobil/databases/(default)/documents/users/' + et.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
  fields: {
    full_name: { stringValue: et.name },
    fullName: { stringValue: et.name },
    name: { stringValue: et.name },
    displayName: { stringValue: et.name },
    branch: { stringValue: et.branch },
    role: { stringValue: 'teacher' },
    status: { stringValue: 'approved' },
    contract_end: { stringValue: et.contract_end },
    phone: { stringValue: et.phone },
    email: { stringValue: et.email },
    teacherTitle: { stringValue: 'Ders Öğretmeni' }
  }
});

class FirebaseService {
  async fetchAllUsers() {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const list = querySnapshot.docs.map(mapSdkToRest);
      EXTRA_TEACHERS.forEach(et => {
        const exists = list.some(u => {
          const n = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || '';
          return n.toLowerCase() === et.name.toLowerCase();
        });
        if (!exists) list.push(makeTeacherRestDoc(et));
      });
      return list;
    } catch (error) {
      console.error('Fetch Error:', error);
      return EXTRA_TEACHERS.map(makeTeacherRestDoc);
    }
  }

  async updateUserStatus(documentId, newStatus) {
    try {
      const docId = documentId.split('/').pop();
      const userRef = doc(db, 'users', docId);
      await updateDoc(userRef, { status: newStatus });
      return true;
    } catch (error) {
      console.error('Update Error:', error);
      return false;
    }
  }

  async updateUserStatusAndBranch(documentId, newStatus, newBranch) {
    try {
      const docId = documentId.split('/').pop();
      const userRef = doc(db, 'users', docId);
      const updateData = { status: newStatus };
      if (newBranch) {
        updateData.branch = newBranch;
      }
      await updateDoc(userRef, updateData);
      return true;
    } catch (error) {
      console.error('Update Error:', error);
      return false;
    }
  }
  async resetDeviceLock(documentId) {
    try {
      const docId = documentId.split('/').pop();
      const userRef = doc(db, 'users', docId);
      await updateDoc(userRef, { 
        registeredDeviceId: null,
        deviceName: null,
        deviceModel: null,
        qrCodeUsed: false,
        lastQrDate: null
      });
      return true;
    } catch (error) {
      console.error('Reset Device Lock Error:', error);
      return false;
    }
  }

  async deleteUser(documentId) {
    try {
      const { deleteDoc } = await import('firebase/firestore');
      const docId = documentId.split('/').pop();
      const userRef = doc(db, 'users', docId);
      await deleteDoc(userRef);
      return true;
    } catch (error) {
      console.error('Delete Error:', error);
      return false;
    }
  }
}

export const firebaseService = new FirebaseService();
