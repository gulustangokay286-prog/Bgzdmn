import React, { useState } from 'react';
import { IconMapPin, IconPhone, IconMail, IconClock } from './Icons';
import './Contact.css';

const Contact = () => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Mesajınız alındı! En kısa sürede sizinle iletişime geçeceğiz.');
    setForm({ name: '', phone: '', email: '', message: '' });
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
                  <p>Yavruturna Mah. Esnafevleri 6.Sk. No:12 Merkez/Çorum</p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon"><IconPhone size={20} /></span>
                <div>
                  <strong>Telefon</strong>
                  <p>0 364 666 05 00</p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon"><IconMail size={20} /></span>
                <div>
                  <strong>E-posta</strong>
                  <p>info@corumbogazici.com</p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon"><IconClock size={20} /></span>
                <div>
                  <strong>Çalışma Saatleri</strong>
                  <p>Pazartesi - Cuma: 08:00 - 17:00</p>
                </div>
              </div>
            </div>
          </div>
          <form className="contact-form" onSubmit={handleSubmit}>
            <h3>Bize Yazın</h3>
            <input type="text" name="name" placeholder="Adınız Soyadınız" value={form.name} onChange={handleChange} required />
            <input type="tel" name="phone" placeholder="Telefon Numaranız" value={form.phone} onChange={handleChange} required />
            <input type="email" name="email" placeholder="E-posta Adresiniz" value={form.email} onChange={handleChange} required />
            <textarea name="message" placeholder="Mesajınız..." rows="4" value={form.message} onChange={handleChange} required></textarea>
            <button type="submit" className="btn btn-red">Gönder</button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;
