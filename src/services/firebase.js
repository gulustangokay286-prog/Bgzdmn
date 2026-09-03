import { db, collection, getDocs, doc, updateDoc, mapSdkToRest } from './firebaseConfig';

const EXTRA_TEACHERS = [
  { name: 'Seçil Özkan', branch: 'Görsel Sanatlar', contract_end: '06.11.2026', phone: '05466860719', email: 'secilozkan@corumbogazici.com' },
  { name: 'Mesut Çolak', branch: 'Matematik', contract_end: '01.09.2027', phone: '05550000001', email: 'mesutcolak@corumbogazici.com' },
  { name: 'Hasan Barış Karataş', branch: 'Biyoloji', contract_end: '01.09.2027', phone: '05550000002', email: 'hasanbaris@corumbogazici.com' },
  { name: 'Selim Kurtaran', branch: 'Fizik', contract_end: '30.06.2027', phone: '05550000003', email: 'selimkurtaran@corumbogazici.com' },
  { name: 'Oya Sadıç Erocağı', branch: 'İngilizce', contract_end: '01.09.2027', phone: '05550000004', email: 'oyasadic@corumbogazici.com' },
  { name: 'Mustafa Yalçın', branch: 'Matematik', contract_end: '01.09.2027', phone: '05550000005', email: 'mustafayalcin@corumbogazici.com' },
  { name: 'İlhami Doğan', branch: 'Ders Öğretmeni', contract_end: '18.10.2026', phone: '05550000006', email: 'ilhamidogan@corumbogazici.com' },
  { name: 'Serpil Satı Ceylan', branch: 'Eğitim Kadrosu', contract_end: 'SINIRSIZ', phone: '05550000007', email: 'serpilsati@corumbogazici.com' },
  { name: 'Muharrem Kodaz', branch: 'Eğitim Kadrosu', contract_end: 'SINIRSIZ', phone: '05550000008', email: 'muharremkodaz@corumbogazici.com' }
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
      let list = querySnapshot.docs.map(mapSdkToRest);

      // Engin Kantemir silinsin
      list = list.filter((u) => {
        const n = (u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || '').toLowerCase();
        const em = (u.fields?.email?.stringValue || '').toLowerCase();
        return !n.includes('kantemir') && !em.includes('kantemir') && !em.includes('enginkantemir');
      });

      // Büşra ve Seher öğretmen olarak ayarlansın
      list.forEach((u) => {
        const n = (u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || '');
        if (n.includes('Büşra') || n.includes('Busra')) {
          if (u.fields) {
            u.fields.role = { stringValue: 'teacher' };
            u.fields.branch = { stringValue: 'Rehberlik' };
          }
          u.role = 'teacher';
        } else if (n === 'Seher Şanlı') {
          if (u.fields) {
            u.fields.role = { stringValue: 'teacher' };
            u.fields.branch = { stringValue: 'İdare / Kurucu' };
          }
          u.role = 'teacher';
        }
      });

      EXTRA_TEACHERS.forEach((et) => {
        const exists = list.some((u) => {
          const r = (u.fields?.role?.stringValue || u.role || '').toLowerCase();
          const n = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || '';
          return (r === 'teacher' || r === 'öğretmen') && n.toLowerCase() === et.name.toLowerCase();
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
