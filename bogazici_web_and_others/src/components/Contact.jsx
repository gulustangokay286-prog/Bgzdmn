"use client";
import React, { useState, useEffect } from 'react';
import { IconMapPin, IconPhone, IconMail, IconClock } from './Icons';
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './Contact.css';

const Contact = () => {
  const [contactInfo, setContactInfo] = useState({
    address: 'Yavruturna Mah. Esnafevleri 6.Sk. No:12 Merkez/Çorum',
    phone: '0 (364) 666 05 00',
    email: 'info@corumbogazici.com',
    workingHours: 'Pazartesi - Cuma: 08:30 - 18:00'
  });
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'web_settings', 'contact'), (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setContactInfo(prev => ({
            ...prev,
            address: d.address || prev.address,
            phone: d.phone || prev.phone,
            email: d.email || prev.email,
            workingHours: d.workingHours || prev.workingHours
          }));
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn("Contact firebase error:", e);
    }
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'contact_messages'), {
        ...form,
        createdAt: serverTimestamp(),
        createdAtMillis: Date.now()
      });
      setSentSuccess(true);
      setForm({ name: '', phone: '', email: '', message: '' });
      setTimeout(() => setSentSuccess(false), 5000);
    } catch (err) {
      console.error("Mesaj gönderilemedi:", err);
      alert('Mesajınız kaydedilirken bir hata oluştu.');
    }
    setIsSubmitting(false);
  };

  return (
    <section className="contact-section" id="iletisim">
      <div className="container">
        <div className="contact-grid">
          <div className="contact-info">
            <h2>İletişim</h2>
            <p className="contact-subtitle cursive">Geleceğiniz için bize ulaşın...</p>
            <div className="info-items">
              <div className="info-item">
                <span className="info-icon"><IconMapPin size={20} /></span>
                <div>
                  <strong>Adres</strong>
                  <p>{contactInfo.address}</p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon"><IconPhone size={20} /></span>
                <div>
                  <strong>Telefon</strong>
                  <p><a href={`tel:${contactInfo.phone.replace(/[^0-9+]/g, '')}`} style={{ color: 'inherit', textDecoration: 'none' }}>{contactInfo.phone}</a></p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon"><IconMail size={20} /></span>
                <div>
                  <strong>E-posta</strong>
                  <p><a href={`mailto:${contactInfo.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{contactInfo.email}</a></p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon"><IconClock size={20} /></span>
                <div>
                  <strong>Çalışma Saatleri</strong>
                  <p>{contactInfo.workingHours}</p>
                </div>
              </div>
            </div>
          </div>

          <form className="contact-form" onSubmit={handleSubmit}>
            <h3>Bize Yazın</h3>
            {sentSuccess && (
              <div style={{ background: '#DCFCE7', color: '#16A34A', padding: '12px 16px', borderRadius: '12px', marginBottom: '14px', fontSize: '0.88rem', fontWeight: 'bold' }}>
                ✓ Mesajınız başarıyla iletildi! En kısa sürede sizinle iletişime geçeceğiz.
              </div>
            )}
            <input type="text" name="name" placeholder="Adınız Soyadınız" value={form.name} onChange={handleChange} required />
            <input type="tel" name="phone" placeholder="Telefon Numaranız" value={form.phone} onChange={handleChange} required />
            <input type="email" name="email" placeholder="E-posta Adresiniz" value={form.email} onChange={handleChange} required />
            <textarea name="message" placeholder="Mesajınız..." rows="4" value={form.message} onChange={handleChange} required></textarea>
            <button type="submit" className="btn btn-red" disabled={isSubmitting}>
              {isSubmitting ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;
