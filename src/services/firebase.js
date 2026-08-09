import { db, collection, getDocs, doc, updateDoc, mapSdkToRest } from './firebaseConfig';

class FirebaseService {
  async fetchAllUsers() {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      return querySnapshot.docs.map(mapSdkToRest);
    } catch (error) {
      console.error('Fetch Error:', error);
      return [];
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
