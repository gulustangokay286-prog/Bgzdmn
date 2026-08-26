import { db, collection, getDocs, addDoc, updateDoc, doc, deleteDoc, getDoc } from './firebaseConfig';
import { financeService } from './financeService';

class PersonnelService {
    
    async getPersonnel() {
        try {
            const snap = await getDocs(collection(db, 'personnel'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('getPersonnel Error:', error);
            return [];
        }
    }

    async addPersonnel(tcNo, name, position, contact, startDate, sgkNo, bankInfo, grossSalary, hourlyRate) {
        try {
            await addDoc(collection(db, 'personnel'), {
                tcNo, name, position, contact, startDate, sgkNo, bankInfo, 
                grossSalary: Number(grossSalary), 
                hourlyRate: Number(hourlyRate), 
                status: 'Aktif',
                createdAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async updatePersonnelStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, 'personnel', id), { status: newStatus });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getPayrolls() {
        try {
            const snap = await getDocs(collection(db, 'payroll'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async addPayroll(personnelId, month, year, grossSalary, deductions, overtime, netSalary, type = 'Aylık Maaş') {
        try {
            await addDoc(collection(db, 'payroll'), {
                personnelId, month, year, type,
                grossSalary: Number(grossSalary), 
                deductions: Number(deductions), 
                overtime: Number(overtime), 
                netSalary: Number(netSalary), 
                status: 'Taslak',
                createdAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async approvePayroll(id, cashRegisterId = 'Genel') {
        try {
            const payrollRef = doc(db, 'payroll', id);
            const payrollSnap = await getDoc(payrollRef);
            if (!payrollSnap.exists()) return false;
            
            const data = payrollSnap.data();
            
            const pRef = doc(db, 'personnel', data.personnelId);
            const pSnap = await getDoc(pRef);
            const pName = pSnap.exists() ? pSnap.data().name : 'Personel';

            const txTitle = `${pName} - ${data.month}/${data.year} ${data.type} Ödemesi`;
            await financeService.addCashTransaction(
                cashRegisterId, 
                txTitle, 
                data.netSalary, 
                'expense', 
                'Personel Gideri', 
                'Banka Transferi', 
                new Date().toISOString().split('T')[0], 
                '-'
            );

            await updateDoc(payrollRef, { status: 'Ödendi' });
            return true;
        } catch (error) {
            console.error('approvePayroll Error:', error);
            return false;
        }
    }
}

export const personnelService = new PersonnelService();
