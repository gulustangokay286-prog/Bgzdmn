import React from 'react';
import { IconCheck } from './Icons';
import './Values.css';

const valuesLeft = [
  { title: 'Bilgili', desc: 'Farklı disiplinleri bir arada kullanıyor, bilgiyi keşfederek kavramsal anlayışı geliştiriyoruz.' },
  { title: 'Evrensel', desc: 'Dünya vatandaşları yetiştiriyor, tüm kültürlere oryante olabilecek bireyler yetiştiriyoruz.' },
  { title: 'Duyarlı', desc: 'Empati kuruyor, şefkat gösteriyor ve sonsuz saygı duyuyoruz. Çevremizdeki dünya üzerinde olumlu bir fark yaratmak üzere hareket ediyoruz.' },
];

const valuesRight = [
  { title: 'Düşünen', desc: 'Problemleri analiz etmek ve bunlarla ilgili sorumluluk sahibi eylemlerde bulunmak için eleştirel ve yaratıcı düşünme becerilerini keşfediyoruz.' },
  { title: 'Açık Fikirli', desc: 'Kendi kültürümüz ve kişisel geçmişimizin yanı sıra, diğer kültürel değer ve geleneklerine de önem veriyoruz.' },
  { title: 'İşbirlikçi', desc: 'Kişisel gelişimimizi destekleyecek güçlü ve güçsüz yanlarımızı anlamak için çaba sarf ediyoruz.' },
];

const Values = () => {
  return (
    <section className="values-section" id="hakkimizda">
      <div className="container">
        <div className="values-heading">
          <h2>DAHA İYİ BİR GELECEK İÇİN</h2>
          <h2 className="values-brand">BOĞAZİÇİ</h2>
        </div>

        <div className="values-grid">
          <div className="values-col">
            {valuesLeft.map((v, i) => (
              <div className="value-item" key={i}>
                <div className="value-check"><IconCheck size={14} color="#fff" /></div>
                <div>
                  <h4>{v.title}</h4>
                  <p>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="values-center">
            <div className="diamond-frame">
              <img src="/values-student.png" alt="Öğrenci" />
            </div>
          </div>

          <div className="values-col">
            {valuesRight.map((v, i) => (
              <div className="value-item right" key={i}>
                <div className="value-check"><IconCheck size={14} color="#fff" /></div>
                <div>
                  <h4>{v.title}</h4>
                  <p>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Values;
