import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import EducationLevels from './components/EducationLevels';
import News from './components/News';
import Values from './components/Values';
import Stats from './components/Stats';
import CTA from './components/CTA';
import Contact from './components/Contact';
import Footer from './components/Footer';
import QRCodeRedirect from './components/QRCodeRedirect';

function App() {
  const isQRCodeRoute = window.location.pathname.startsWith('/qr');

  if (isQRCodeRoute) {
    return <QRCodeRedirect />;
  }

  return (
    <>
      <Header />
      <main>
        <Hero />
        <EducationLevels />
        <Values />
        <Stats />
        <News />
        <CTA />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

export default App;
