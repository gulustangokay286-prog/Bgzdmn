"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Check, 
  X, 
  CreditCard, 
  Cpu, 
  CheckCircle,
  Lock,
  Binary,
  Layers,
  Sparkles,
  Server
} from 'lucide-react';
import './TCValidationModal.css';

const validateTCKimlik = (tc) => {
  if (!tc || typeof tc !== 'string') return false;
  const digits = tc.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (digits[0] === '0') return false;

  const d = digits.split('').map(Number);
  
  // 1, 3, 5, 7, 9. basamaklar toplamı
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  // 2, 4, 6, 8. basamaklar toplamı
  const evenSum = d[1] + d[3] + d[5] + d[7];

  // 10. basamak kuralı: ((oddSum * 7) - evenSum) % 10
  let digit10 = ((oddSum * 7) - evenSum) % 10;
  if (digit10 < 0) digit10 += 10;
  if (digit10 !== d[9]) return false;

  // 11. basamak kuralı: ilk 10 basamağın toplamı % 10
  const first10Sum = d.slice(0, 10).reduce((acc, val) => acc + val, 0);
  if (first10Sum % 10 !== d[10]) return false;

  return true;
};

export default function TCValidationAnimationModal({ tcKimlik, mode = 'login', onComplete }) {
  const [phase, setPhase] = useState('initializing'); // initializing, materializing, extracting, verifying, finalizing, result
  const [revealedDigits, setRevealedDigits] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Kimlik verisi hazırlanıyor...');
  const [isValid, setIsValid] = useState(null);
  
  const [steps, setSteps] = useState([
    { id: 1, title: 'Format Doğrulaması (11 Hane & Nümerik)', state: 'pending', icon: Binary },
    { id: 2, title: 'İlk Hane Sıfır Kontrolü', state: 'pending', icon: Layers },
    { id: 3, title: 'Modül-10 Tek/Çift Algoritması', state: 'pending', icon: Cpu },
    { id: 4, title: 'Sağlama Toplamı (Checksum) Doğrulaması', state: 'pending', icon: ShieldCheck },
    { id: 5, title: 'Kurumsal Sistem Eşleştirmesi', state: 'pending', icon: Server },
  ]);

  const isCancelledRef = useRef(false);

  useEffect(() => {
    isCancelledRef.current = false;

    async function runPipeline() {
      // 0. Initial Pause
      await new Promise(r => setTimeout(r, 200));
      if (isCancelledRef.current) return;

      const isFormatValid = /^[1-9]\d{10}$/.test(tcKimlik);
      const isAlgValid = validateTCKimlik(tcKimlik);

      // 1. Materializing
      setPhase('materializing');
      setStatusText('Güvenli bağlantı kuruluyor...');
      await new Promise(r => setTimeout(r, 450));
      if (isCancelledRef.current) return;

      // 2. Extracting Digits
      setPhase('extracting');
      setStatusText('Kimlik verileri ayrıştırılıyor...');
      for (let i = 0; i < 11; i++) {
        setRevealedDigits(i + 1);
        await new Promise(r => setTimeout(r, 35));
        if (isCancelledRef.current) return;
      }

      // 3. Verifying Steps
      setPhase('verifying');
      const checks = [
        true,
        isFormatValid,
        isFormatValid && isAlgValid,
        isFormatValid && isAlgValid,
        isAlgValid
      ];

      let allPassed = true;
      for (let idx = 0; idx < steps.length; idx++) {
        setSteps(prev => prev.map((s, i) => i === idx ? { ...s, state: 'running' } : s));
        setStatusText(steps[idx].title + '...');
        await new Promise(r => setTimeout(r, 300));
        if (isCancelledRef.current) return;

        const ok = checks[idx];
        setSteps(prev => prev.map((s, i) => i === idx ? { ...s, state: ok ? 'passed' : 'failed' } : s));
        setProgress(Math.round(((idx + 1) / steps.length) * 100));

        if (!ok) {
          allPassed = false;
          break;
        }
        await new Promise(r => setTimeout(r, 60));
        if (isCancelledRef.current) return;
      }

      // 4. Finalizing
      setPhase('finalizing');
      setStatusText(allPassed ? 'Sonuç onaylanıyor...' : 'İşlem sonlandırılıyor...');
      setProgress(100);
      await new Promise(r => setTimeout(r, 300));
      if (isCancelledRef.current) return;

      // 5. Result
      const validFinal = allPassed && isAlgValid;
      setIsValid(validFinal);
      setPhase('result');
      setStatusText(validFinal ? 'Doğrulama tamamlandı.' : 'Geçersiz T.C. Kimlik numarası.');

      await new Promise(r => setTimeout(r, 900));
      if (isCancelledRef.current) return;
      onComplete(validFinal);
    }

    runPipeline();

    return () => {
      isCancelledRef.current = true;
    };
  }, [tcKimlik, mode]);

  const rawDigits = (tcKimlik || '').slice(0, 11).split('');
  while (rawDigits.length < 11) rawDigits.push('•');

  const maskedTC = tcKimlik.length === 11 
    ? `${tcKimlik.slice(0, 3)} ••• ••• ${tcKimlik.slice(9, 11)}`
    : (tcKimlik || '—');

  return (
    <div className="tc-modal-backdrop animate-fade-in">
      <div className="tc-modal-container">
        
        {/* Title Block */}
        <div className="tc-title-block">
          <h2 className={`tc-main-title ${phase === 'result' ? (isValid ? 'title-success' : 'title-error') : ''}`}>
            {phase === 'result' 
              ? (isValid ? 'Kimlik Doğrulandı' : 'Geçersiz Kimlik Numarası') 
              : 'Kimlik Doğrulanıyor'}
          </h2>
          <p className="tc-status-desc">{statusText}</p>
          <div className="tc-red-line"></div>
        </div>

        {/* 3D Holo ID Card or Clay Result */}
        <div className="holo-scene-wrap">
          {phase === 'result' ? (
            <div className={`clay-result-bubble ${isValid ? 'clay-success' : 'clay-error'} animate-pop-in`}>
              <div className="clay-pulse-ring"></div>
              <div className="clay-inner-sphere">
                {isValid ? (
                  <Check size={44} strokeWidth={3.5} className="clay-icon-svg" />
                ) : (
                  <X size={44} strokeWidth={3.5} className="clay-icon-svg" />
                )}
              </div>
            </div>
          ) : (
            <div className="holo-card-3d">
              <div className="holo-card-inner">
                <div className="holo-card-chip"></div>
                <div className="holo-card-header">
                  <div className="holo-card-chip-icon">
                    <CreditCard size={18} className="text-white" />
                  </div>
                  <div className="holo-gov-text">DİJİTAL KİMLİK DOĞRULAMA</div>
                </div>
                <div className="holo-card-body">
                  <div className="holo-photo-slot">
                    <CreditCard size={28} className="holo-photo-icon" />
                  </div>
                  <div className="holo-lines-slot">
                    <div className="holo-line w-long"></div>
                    <div className="holo-line w-med"></div>
                    <div className="holo-line w-short"></div>
                  </div>
                </div>
                <div className="laser-scan-ray"></div>
                <div className="specular-shine"></div>
              </div>
            </div>
          )}
        </div>

        {/* 11 Digit Bubbles */}
        <div className="digit-bubbles-row">
          {rawDigits.map((char, i) => {
            const isRevealed = i < revealedDigits;
            const bubbleStateClass = phase === 'result' 
              ? (isValid ? 'digit-pass' : 'digit-fail')
              : (isRevealed ? 'digit-revealed' : 'digit-hidden');

            return (
              <div 
                key={i} 
                className={`digit-bubble ${bubbleStateClass}`}
                style={{ transitionDelay: `${i * 15}ms` }}
              >
                <span>{isRevealed ? char : '•'}</span>
              </div>
            );
          })}
        </div>

        {/* Data Badge */}
        <div className="data-capsule-badge">
          <div className="data-icon-wrap">
            <CreditCard size={15} />
          </div>
          <div className="data-text-col">
            <span className="data-label">TC KİMLİK NO</span>
            <span className="data-val">{maskedTC}</span>
          </div>
          <div className="data-status-icon">
            {phase !== 'result' ? (
              <div className="mini-spinner"></div>
            ) : isValid ? (
              <CheckCircle size={18} className="text-success" />
            ) : (
              <ShieldAlert size={18} className="text-error" />
            )}
          </div>
        </div>

        {/* Step Bubbles */}
        <div className="step-bubbles-container">
          {steps.map((step) => {
            if (step.state === 'running') {
              return (
                <div key={step.id} className="step-pill-running animate-pop-in">
                  <div className="mini-spinner-red"></div>
                  <span>{step.title}</span>
                </div>
              );
            }
            if (step.state === 'passed') {
              return (
                <div key={step.id} className="step-pill-circle step-passed animate-pop-in" title={step.title}>
                  <Check size={12} strokeWidth={3} />
                </div>
              );
            }
            if (step.state === 'failed') {
              return (
                <div key={step.id} className="step-pill-circle step-failed animate-pop-in" title={step.title}>
                  <X size={12} strokeWidth={3} />
                </div>
              );
            }
            return (
              <div key={step.id} className="step-dot-pending" title={step.title}></div>
            );
          })}
        </div>

        {/* Progress Bar */}
        {phase !== 'result' && (
          <div className="progress-track-wrapper">
            <div className="progress-track-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="progress-percent-text">%{progress}</span>
          </div>
        )}

      </div>
    </div>
  );
}
