import { db, collection, getDocs, addDoc, updateDoc, doc } from './firebaseConfig';
import { financeService } from './financeService';

class InvoiceService {
    async getInvoices() {
        try {
            const snap = await getDocs(collection(db, 'invoices'));
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('getInvoices Error:', error);
            return [];
        }
    }

    async addInvoice(invoiceNo, customerName, taxNo, taxOffice, baseAmount, vatRate, type = 'Satış') {
        try {
            const numBase = Number(baseAmount);
            const numVatRate = Number(vatRate);
            const vatAmount = numBase * (numVatRate / 100);
            const totalAmount = numBase + vatAmount;

            await addDoc(collection(db, 'invoices'), {
                invoiceNo, customerName, taxNo, taxOffice, type,
                baseAmount: numBase,
                vatRate: numVatRate,
                vatAmount: vatAmount,
                totalAmount: totalAmount,
                status: 'Bekliyor', 
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async payInvoice(invoiceId, targetType, targetId) {
        
        try {
            
            const invoices = await this.getInvoices();
            const inv = invoices.find(x => x.id === invoiceId);
            if (!inv) return false;

            const dateStr = new Date().toISOString().split('T')[0];
            const title = `Fatura Tahsilatı: ${inv.invoiceNo} - ${inv.customerName}`;

            if (targetType === 'cash') {
                await financeService.addCashTransaction(targetId, title, inv.totalAmount, 'income', 'Fatura', 'Nakit', dateStr, inv.invoiceNo);
            } else if (targetType === 'bank') {
                await financeService.addBankTransaction(targetId, title, inv.totalAmount, 'income', dateStr, 'Fatura Tahsilatı');
            }

            await updateDoc(doc(db, 'invoices', invoiceId), { status: 'Ödendi' });
            return true;
        } catch (error) {
            return false;
        }
    }

    async cancelInvoice(invoiceId) {
        try {
            await updateDoc(doc(db, 'invoices', invoiceId), { status: 'İptal' });
            return true;
        } catch (error) {
            return false;
        }
    }
}

export const invoiceService = new InvoiceService();
