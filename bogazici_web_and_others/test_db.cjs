const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'ial-mobil' });
const db = admin.firestore();
db.collection('active_qr_nonce').doc('current_entry').get()
  .then(doc => console.log('Data:', doc.data()))
  .catch(err => console.error(err));
