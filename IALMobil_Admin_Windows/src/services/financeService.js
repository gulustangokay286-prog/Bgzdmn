import { db, collection, getDocs, addDoc, updateDoc, doc, mapSdkToRest, deleteDoc } from './firebaseConfig';

class FinanceService {
    
    async getCashRegisters() {
        try {
            const snap = await getDocs(collection(db, 'cash_registers'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('getCashRegisters Error:', error);
            return [];
        }
    }

    async addCashRegister(name, type, openingBalance) {
        try {
            await addDoc(collection(db, 'cash_registers'), {
                name, type, openingBalance: Number(openingBalance), status: 'Aktif', createdAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getCashTransactions() {
        try {
            const snap = await getDocs(collection(db, 'cash_transactions'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('getCashTransactions Error:', error);
            return [];
        }
    }

    async addCashTransaction(registerId, title, amount, type, category, paymentMethod, date, receiptNo) {
        try {
            await addDoc(collection(db, 'cash_transactions'), {
                registerId, title, amount: Number(amount), type, category, paymentMethod, date, receiptNo, createdAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getCashSessions() {
        try {
            const snap = await getDocs(collection(db, 'cash_sessions'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async closeCashRegister(registerId, openBalance, closeBalance, notes) {
        try {
            await addDoc(collection(db, 'cash_sessions'), {
                registerId, openedAt: new Date().toISOString(), closedAt: new Date().toISOString(),
                openBalance: Number(openBalance), closeBalance: Number(closeBalance), diff: Number(closeBalance) - Number(openBalance), notes
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getDefinitions() {
        try {
            const snap = await getDocs(collection(db, 'finance_definitions'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async addDefinition(name, code, type) {
        try {
            await addDoc(collection(db, 'finance_definitions'), {
                name, code, type, isActive: true
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getBankAccounts() {
        try {
            const snap = await getDocs(collection(db, 'bank_accounts'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async addBankAccount(bankName, branch, iban, accountType, balance) {
        try {
            await addDoc(collection(db, 'bank_accounts'), {
                bankName, branch, iban, accountType, balance: Number(balance), status: 'Aktif'
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getBankTransactions() {
        try {
            const snap = await getDocs(collection(db, 'bank_transactions'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async addBankTransaction(accountId, title, amount, type, date, description) {
        try {
            await addDoc(collection(db, 'bank_transactions'), {
                accountId, title, amount: Number(amount), type, date, description
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getChecksAndNotes() {
        try {
            const snap = await getDocs(collection(db, 'checks_notes'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async addCheckOrNote(type, direction, amount, dueDate, relatedTo) {
        try {
            await addDoc(collection(db, 'checks_notes'), {
                type, direction, amount: Number(amount), dueDate, relatedTo, status: 'Portföyde', interestRate: 0
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async updateCheckNoteStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, 'checks_notes', id), { status: newStatus });
            return true;
        } catch (error) {
            return false;
        }
    }

    async fetchStudentPayments() {
        try {
            const querySnapshot = await getDocs(collection(db, 'finance_student_payments'));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            return [];
        }
    }

    async initOrGetStudentPayment(studentId) {
        const all = await this.fetchStudentPayments();
        let record = all.find(r => r.studentId === studentId);
        if (!record) {
            const newRec = {
                studentId, plan: "Bilinmiyor", total: 100000, paid: 0, due: 0, status: "Kayıt Bekliyor", nextPayment: "-"
            };
            const docRef = await addDoc(collection(db, 'finance_student_payments'), newRec);
            record = { id: docRef.id, ...newRec };
        }
        return record;
    }

    async addStudentPayment(studentId, amount, paymentMethod, studentName, date) {
        try {
            
            await this.addCashTransaction('Genel', `${studentName} Taksit Ödemesi`, amount, 'income', 'Eğitim Ücreti', paymentMethod, date, '-');
            
            const record = await this.initOrGetStudentPayment(studentId);
            const newPaid = record.paid + Number(amount);
            const newDue = Math.max(0, record.due - Number(amount));
            const newStatus = newPaid >= record.total ? "Tamamlandı" : (newDue > 0 ? "Gecikmiş Ödeme" : "Düzenli Ödüyor");

            await updateDoc(doc(db, 'finance_student_payments', record.id), {
                paid: newPaid, due: newDue, status: newStatus
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async updateStudentPlan(studentId, planName, totalAmount) {
        try {
            const record = await this.initOrGetStudentPayment(studentId);
            const newStatus = record.paid >= Number(totalAmount) ? "Tamamlandı" : "Düzenli Ödüyor";
            await updateDoc(doc(db, 'finance_student_payments', record.id), {
                plan: planName, total: Number(totalAmount), status: newStatus
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    calculateBalance(transactions) {
        let bal = 0.0;
        for (const doc of transactions) {
            const val = Number(doc.amount || 0.0);
            if (doc.type === 'income') bal += val;
            else bal -= val;
        }
        return bal;
    }

    async transferFunds(fromType, fromId, toType, toId, amount, description) {
        
        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const numAmount = Number(amount);

            if (fromType === 'cash') {
                await this.addCashTransaction(fromId, `Virman Çıkışı: ${description}`, numAmount, 'expense', 'Transfer', 'Nakit', dateStr, '-');
            } else if (fromType === 'bank') {
                await this.addBankTransaction(fromId, `Virman Çıkışı: ${description}`, numAmount, 'expense', dateStr, 'Transfer');
            }

            if (toType === 'cash') {
                await this.addCashTransaction(toId, `Virman Girişi: ${description}`, numAmount, 'income', 'Transfer', 'Nakit', dateStr, '-');
            } else if (toType === 'bank') {
                await this.addBankTransaction(toId, `Virman Girişi: ${description}`, numAmount, 'income', dateStr, 'Transfer');
            }

            return true;
        } catch (error) {
            console.error('transferFunds Error:', error);
            return false;
        }
    }

    async processPosTransaction(bankAccountId, amount, commissionRate, description) {
        try {
            const numAmount = Number(amount);
            const numRate = Number(commissionRate);
            
            const commission = numAmount * (numRate / 100);
            const netAmount = numAmount - commission;

            const dateStr = new Date().toISOString().split('T')[0];
            
            await this.addBankTransaction(bankAccountId, `POS Tahsilat: ${description}`, netAmount, 'income', dateStr, `Brüt: ${numAmount} - Komisyon(%${numRate}): ${commission}`);
            
            return true;
        } catch (error) {
            return false;
        }
    }
}

export const financeService = new FinanceService();
