import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from './services/firebaseConfig';
import LoginView from './views/LoginView';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import {
  CalendarX2,
  Users, UserCheck, ShieldAlert, FileText,
  BookOpen, Video, FileEdit, Coffee,
  BarChart3, QrCode, RadioReceiver, DoorOpen,
  CalendarClock, Bus, CircleDollarSign, MessageSquare,
  Settings, Shield, BellRing, UserCircle, HeartHandshake,
  BrainCircuit, Key, LogOut, ShieldBan, Building, ChevronDown, Moon, Sun, Wallet, Landmark, ClipboardList, PieChart,
  Menu, X, Smartphone
} from 'lucide-react';
import logo from './assets/logo.png';

import RequireLicense from './components/RequireLicense';

import DashboardView from './views/DashboardView';
import RegistrationApprovalView from './views/RegistrationApprovalView';
import UsersView from './views/UsersView';
import GradesAdminView from './views/GradesAdminView';
import AttendanceAdminView from './views/AttendanceAdminView';
import DailyAbsenceReportView from './views/DailyAbsenceReportView';
import EbosPortalView from './views/EbosPortalView';
import QRGeneratorAdminView from './views/QRGeneratorAdminView';
import QRCodeRedirect from './views/QRCodeRedirect';
import AttendanceLiveView from './views/AttendanceLiveView';
import TeacherManagementAdminView from './views/TeacherManagementAdminView';
import ScheduleAdminView from './views/ScheduleAdminView';
import AnnouncementsAdminView from './views/AnnouncementsAdminView';

import CafeteriaAdminView from './views/CafeteriaAdminView';
import AppointmentsAdminView from './views/AppointmentsAdminView';
import TransportAdminView from './views/TransportAdminView';
import CounselingAdminView from './views/CounselingAdminView';
import ChatView from './views/ChatView';
import NovaAIAdminView from './views/NovaAIAdminView';
import TeacherAIAnalysisView from './views/TeacherAIAnalysisView';
import SettingsView from './views/SettingsView';
import InstitutionSettingsAdminView from './views/InstitutionSettingsAdminView';
import SecurityLogsView from './views/SecurityLogsView';
import PushNotificationAdminView from './views/PushNotificationAdminView';
import StudentGateAdminView from './views/StudentGateAdminView';
import ProfileView from './views/ProfileView';
import CheatLogsAdminView from './views/CheatLogsAdminView';
import DeviceManagementView from './views/DeviceManagementView';
import useAttendanceAutomation from './hooks/useAttendanceAutomation';

const NavItem = ({ to, icon: Icon, label, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
  >
    <Icon size={18} />
    <span>{label}</span>
  </NavLink>
);

const Sidebar = ({ isOpen, onClose }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.sidebar-header')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <>
      { }
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[90] md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}
      <div className={`sidebar fixed inset-y-0 left-0 z-[100] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button onClick={onClose} className="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white bg-white/5 w-9 h-9 flex items-center justify-center rounded-full z-[110]">
          <X size={20} />
        </button>
        <div className="drag-region-top hidden md:block" />
      <div 
        className="sidebar-header relative flex flex-col items-center justify-center pt-12 pb-6 px-4 gap-3 select-none"
      >
        <img src="/logo-chatgpt.png" alt="Logo" className="h-10 w-auto object-contain drop-shadow-lg rounded-lg mb-1" />
        
        <div className="flex flex-col items-center text-center">
          <span className="text-[20px] font-black text-slate-900 dark:text-white leading-tight tracking-wide">Boğaziçi Koleji</span>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-[0.2em] uppercase mt-1">Yönetim Sistemi</span>
        </div>

        <div 
          className="flex items-center gap-1.5 mt-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 cursor-pointer transition-colors group border border-slate-200 dark:border-transparent dark:bg-white/5 dark:hover:bg-white/10"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Hızlı Ayarlar</span>
          <ChevronDown size={14} className={`text-slate-500 dark:text-slate-300 transition-transform duration-300 ${dropdownOpen ? 'rotate-180 text-slate-800 dark:text-white' : ''}`} />
        </div>
        
        {dropdownOpen && (
          <div className="absolute top-[95%] left-4 right-4 mt-2 bg-white dark:bg-[#1e293b] rounded-2xl p-2 z-[100] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-700/50 flex flex-col gap-1 origin-top animate-in fade-in zoom-in-95 duration-200">
            <button onClick={(e) => { e.stopPropagation(); document.documentElement.classList.toggle('dark'); const isDark = document.documentElement.classList.contains('dark'); document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light'); localStorage.setItem('app-theme', isDark ? 'dark' : 'light'); }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white hover:text-slate-900 dark:hover:text-[#0f172a] text-left w-full"><Sun size={16} className="hidden dark:block" /><Moon size={16} className="block dark:hidden" /> Tema Değiştir</button>
            <NavLink to="/settings" className={({isActive}) => `no-underline flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${isActive ? 'bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm dark:shadow-inner border border-slate-200 dark:border-white/5' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white hover:text-slate-900 dark:hover:text-[#0f172a]'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><Settings size={16} /> Ayarlar</NavLink>
            <NavLink to="/institution-settings" className={({isActive}) => `no-underline flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${isActive ? 'bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm dark:shadow-inner border border-slate-200 dark:border-white/5' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white hover:text-slate-900 dark:hover:text-[#0f172a]'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><Building size={16} /> Kurum Kuralları</NavLink>
            <NavLink to="/security" className={({isActive}) => `no-underline flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${isActive ? 'bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm dark:shadow-inner border border-slate-200 dark:border-white/5' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white hover:text-slate-900 dark:hover:text-[#0f172a]'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><ShieldAlert size={16} /> Sistem Logları</NavLink>
            <NavLink to="/profile" className={({isActive}) => `no-underline flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${isActive ? 'bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm dark:shadow-inner border border-slate-200 dark:border-white/5' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white hover:text-slate-900 dark:hover:text-[#0f172a]'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><Key size={16} /> Yönetici Profili</NavLink>
          </div>
        )}
      </div>
      <div className="sidebar-content pt-2">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Sistem Yönetimi</div>
          <NavItem to="/dashboard" icon={BarChart3} label="Dashboard" onClick={onClose} />
          <NavItem to="/nova-ai" icon={BrainCircuit} label="Yapay Zeka Merkezi" onClick={onClose} />
          <NavItem to="/qr" icon={QrCode} label="QR Geçiş Sistemi" onClick={onClose} />
          <NavItem to="/cheats" icon={ShieldBan} label="İhlal Tespitleri" onClick={onClose} />
          <NavItem to="/live-attendance" icon={RadioReceiver} label="Canlı Geçiş Takibi" onClick={onClose} />
          <NavItem to="/student-gate" icon={DoorOpen} label="Öğrenci Geçiş" onClick={onClose} />
          <NavItem to="/device-management" icon={Smartphone} label="Cihaz Yönetimi" onClick={onClose} />
          <NavItem to="/push" icon={BellRing} label="Bildirim Merkezi" onClick={onClose} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">ERP & Finans</div>
          {/* <NavItem to="/ebos" icon={Building} label="Boğaziçi Portal" onClick={onClose} /> */}
          <NavItem to="/appointments" icon={CalendarClock} label="Randevu Yönetimi" onClick={onClose} />
          <NavItem to="/transport" icon={Bus} label="Servis Yönetimi" onClick={onClose} />
          <NavItem to="/cafeteria" icon={Coffee} label="Kafeterya Menüsü" onClick={onClose} />
          <NavItem to="/chat" icon={MessageSquare} label="Yönetici Chat" onClick={onClose} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Akademik Yönetim</div>
          <NavItem to="/teachers" icon={ShieldAlert} label="Öğretmenler" onClick={onClose} />
          <NavItem to="/grades" icon={FileEdit} label="Not Yönetimi" onClick={onClose} />
          <NavItem to="/attendance" icon={UserCircle} label="Devamsızlık" onClick={onClose} />
          <NavItem to="/daily-absences" icon={CalendarX2} label="Günlük Devamsızlık Raporu" onClick={onClose} />
          <NavItem to="/schedule" icon={CalendarClock} label="Ders Programı" onClick={onClose} />
          <NavItem to="/counseling" icon={HeartHandshake} label="Rehberlik & Psikoloji" onClick={onClose} />
          <NavItem to="/announcements" icon={BellRing} label="Duyurular" onClick={onClose} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Öğrenci & Kullanıcı</div>
          <NavItem to="/approvals" icon={UserCheck} label="Onay Bekleyenler" onClick={onClose} />
          <NavItem to="/users" icon={UserCircle} label="Kullanıcılar" onClick={onClose} />
        </div>
      </div>
      <div className="p-5 border-t border-white/5">
        <button 
          onClick={() => getAuth().signOut()}
          className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl cursor-pointer font-bold transition-all"
        >
          <LogOut size={18} />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </div>
    </>
  );
};

/**
 * Otomatik Yoklama Motoru.
 * Panel açık olduğu sürece dakikada bir çalışır; 12:10 otomatik çıkışlarını,
 * 12:00 yarım gün ve okul çıkış saatindeki tam gün devamsızlıklarını işler.
 * Görsel çıktısı yoktur, yalnızca arka planda görev yürütür.
 */
const AttendanceAutomationRunner = () => {
  useAttendanceAutomation(true);
  return null;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setMobileMenuOpen(false);
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const urlParams = new URLSearchParams(window.location.search);
  const isQRScan = 
    urlParams.has('sessionId') ||
    (window.location.pathname.startsWith('/qr') && (urlParams.has('type') || urlParams.has('action'))) ||
    (window.location.hash.startsWith('#/qr') && (urlParams.has('type') || urlParams.has('action')));

  if (isQRScan) {
    return <QRCodeRedirect />;
  }

  if (loadingAuth) {
    return <div className="flex items-center justify-center w-full min-h-screen bg-[var(--bg-base)]" style={{ color: 'var(--text-muted)' }}>Yükleniyor...</div>;
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <ThemeProvider>
      <Router>
        <div className="app-container">
          <AttendanceAutomationRunner />
          <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
          <div className="main-content bg-[var(--bg-base)] flex flex-col relative w-full">
            <div className="drag-region-top hidden md:block" />
            
            { }
            <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[var(--bg-sidebar)] border-b border-slate-200 dark:border-white/5 sticky top-0 z-40 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-3">
                <button onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                  <Menu size={24} />
                </button>
                <div id="nova-ai-mobile-portal" className="empty:hidden" />
                <img src="/logo-chatgpt.png" alt="Logo" className="h-7 w-auto drop-shadow-sm dark:drop-shadow-md rounded-md" />
              </div>
              <div className="font-bold text-[15px] text-slate-800 dark:text-white tracking-wide">Boğaziçi Koleji</div>
            </div>

            <div className="relative px-4 pt-4 pb-6 md:p-8 flex-1 flex flex-col box-border min-h-0" onClick={() => setMobileMenuOpen(false)}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<RequireLicense requiredPath="/dashboard"><DashboardView /></RequireLicense>} />
              <Route path="/approvals" element={<RequireLicense requiredPath="/approvals"><RegistrationApprovalView /></RequireLicense>} />
              <Route path="/users" element={<RequireLicense requiredPath="/users"><UsersView /></RequireLicense>} />
              <Route path="/grades" element={<RequireLicense requiredPath="/grades"><GradesAdminView /></RequireLicense>} />
              <Route path="/attendance" element={<RequireLicense requiredPath="/attendance"><AttendanceAdminView /></RequireLicense>} />
              <Route path="/daily-absences" element={<RequireLicense requiredPath="/attendance"><DailyAbsenceReportView /></RequireLicense>} />
              <Route path="/ebos" element={<RequireLicense requiredPath="/finance"><EbosPortalView /></RequireLicense>} />

              <Route path="/nova-ai" element={<RequireLicense requiredPath="/nova-ai"><NovaAIAdminView /></RequireLicense>} />
              <Route path="/qr" element={<RequireLicense requiredPath="/qr"><QRGeneratorAdminView /></RequireLicense>} />
              <Route path="/qr-generator" element={<RequireLicense requiredPath="/qr"><QRGeneratorAdminView /></RequireLicense>} />
              <Route path="/live-attendance" element={<RequireLicense requiredPath="/live-attendance"><AttendanceLiveView /></RequireLicense>} />
              <Route path="/teachers" element={<RequireLicense requiredPath="/teachers"><TeacherManagementAdminView /></RequireLicense>} />
              <Route path="/teachers/ai-analysis/:teacherId" element={<RequireLicense requiredPath="/teachers"><TeacherAIAnalysisView /></RequireLicense>} />
              <Route path="/schedule" element={<RequireLicense requiredPath="/schedule"><ScheduleAdminView /></RequireLicense>} />
              <Route path="/announcements" element={<RequireLicense requiredPath="/announcements"><AnnouncementsAdminView /></RequireLicense>} />
              <Route path="/device-management" element={<RequireLicense requiredPath="/student-gate"><DeviceManagementView /></RequireLicense>} />

              <Route path="/cafeteria" element={<RequireLicense requiredPath="/cafeteria"><CafeteriaAdminView /></RequireLicense>} />
              <Route path="/appointments" element={<RequireLicense requiredPath="/appointments"><AppointmentsAdminView /></RequireLicense>} />
              <Route path="/transport" element={<RequireLicense requiredPath="/transport"><TransportAdminView /></RequireLicense>} />
              <Route path="/counseling" element={<RequireLicense requiredPath="/counseling"><CounselingAdminView /></RequireLicense>} />
              <Route path="/chat" element={<RequireLicense requiredPath="/chat"><ChatView /></RequireLicense>} />
              <Route path="/settings" element={<RequireLicense requiredPath="/settings"><SettingsView /></RequireLicense>} />
              <Route path="/institution-settings" element={<RequireLicense requiredPath="/settings"><InstitutionSettingsAdminView /></RequireLicense>} />
              <Route path="/security" element={<RequireLicense requiredPath="/security"><SecurityLogsView /></RequireLicense>} />
              <Route path="/push" element={<RequireLicense requiredPath="/push"><PushNotificationAdminView /></RequireLicense>} />
              <Route path="/student-gate" element={<RequireLicense requiredPath="/student-gate"><StudentGateAdminView /></RequireLicense>} />
              <Route path="/profile" element={<RequireLicense requiredPath="/profile"><ProfileView /></RequireLicense>} />
              <Route path="/cheats" element={<RequireLicense requiredPath="/cheats"><CheatLogsAdminView /></RequireLicense>} />
              <Route path="*" element={
                <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <h2>Geçersiz Bağlantı</h2>
                </div>
              } />
            </Routes>
          </div>
        </div>
      </div>
      </Router>
    </ThemeProvider>
  );
};

export default App;
