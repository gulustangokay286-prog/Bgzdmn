import { db, collection, getDocs, addDoc, deleteDoc, doc, mapSdkToRest, unwrapRestPayload } from './firebaseConfig';

class DBService {
  async fetchCollection(collectionName) {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      return querySnapshot.docs.map(mapSdkToRest);
    } catch (error) {
      console.error(`Fetch Error (${collectionName}):`, error);
      return [];
    }
  }

  async addDocument(collectionName, fieldsObj) {
    try {
      const data = unwrapRestPayload(fieldsObj);
      await addDoc(collection(db, collectionName), data);
      return true;
    } catch (error) {
      console.error(`Add Error (${collectionName}):`, error);
      return false;
    }
  }

  async deleteDocument(collectionName, documentId) {
    try {
      const docId = documentId.split('/').pop();
      await deleteDoc(doc(db, collectionName, docId));
      return true;
    } catch (error) {
      console.error(`Delete Error (${collectionName}/${documentId}):`, error);
      return false;
    }
  }
}

export const dbService = new DBService();
