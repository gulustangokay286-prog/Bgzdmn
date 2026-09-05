import Header from "@/components/Header";
import Hero from "@/components/Hero";
import EducationLevels from "@/components/EducationLevels";
import Values from "@/components/Values";
import Stats from "@/components/Stats";
import ShopShowcase from "@/components/ShopShowcase";
import News from "@/components/News";
import FAQSection from "@/components/FAQSection";
import CTA from "@/components/CTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <EducationLevels />
        <CTA />
        <Values />
        <Stats />
        <ShopShowcase />
        <News />
        <FAQSection />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
