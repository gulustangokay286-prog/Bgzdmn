import { db, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, mapSdkToRest } from './firebaseConfig';

class AcademicService {
  async saveGrade(studentId, course, exam, score, teacher, term) {
    try {
      const data = {
        studentId: studentId,
        courseName: course,
        examType: exam,
        score: Number(score),
        teacherName: teacher,
        term: term,
        academicYear: "2024-2025",
        date: new Date(),
        updatedAt: new Date()
      };
      await addDoc(collection(db, 'grades'), data);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async saveAttendance(studentId, course, period, isLate, isExcused) {
    try {
      let statusStr = "absent";
      if (isLate) statusStr = "late";
      else if (isExcused) statusStr = "excused";

      const data = {
        studentId: studentId,
        className: "Admin Paneli",
        courseName: course,
        periodIndex: Number(period),
        status: statusStr,
        recordedBy: "Admin Panel",
        date: new Date(),
        timestamp: new Date()
      };
      await addDoc(collection(db, 'attendance'), data);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async fetchStudentGrades(studentId) {
    try {
      const querySnapshot = await getDocs(collection(db, 'grades'));
      const all = querySnapshot.docs.map(mapSdkToRest);
      return all.filter(doc => doc.fields?.studentId?.stringValue === studentId);
    } catch (err) {
      return [];
    }
  }

  async fetchStudentAttendance(studentId) {
    try {
      const querySnapshot = await getDocs(collection(db, 'attendance'));
      const all = querySnapshot.docs.map(mapSdkToRest);
      return all.filter(doc => doc.fields?.studentId?.stringValue === studentId);
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async fetchGateLogs(userId) {
    try {
      const snap = await getDocs(collection(db, 'gate_logs'));
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return all.filter(d => d.userId === userId).sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
    } catch(err) {
      console.error(err);
      return [];
    }
  }

  async updateAttendanceReportStatus(documentId) {
    try {
      const docId = documentId.split('/').pop();
      await updateDoc(doc(db, 'attendance', docId), {
        status: "excused",
        courseName: "Tam Gün (Raporlu)",
        timestamp: new Date()
      });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async deleteDocument(collectionName, documentId) {
    try {
      const docId = documentId.split('/').pop();
      await deleteDoc(doc(db, collectionName, docId));
      return true;
    } catch (err) {
      return false;
    }
  }
}

export const academicService = new AcademicService();
