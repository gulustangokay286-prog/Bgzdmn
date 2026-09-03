import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from './services/firebaseConfig';
import LoginView from './views/LoginView';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import {
  LayoutDashboard, BrainCircuit, QrCode, RadioTower, DoorOpen, CalendarX2, ClipboardList,
  UserSquare, FileEdit, HeartHandshake, Users, UserCheck, Megaphone, BellRing, MessageSquare,
  CalendarClock, Bus, Coffee, Globe, Inbox, ShieldAlert, Smartphone, HeartPulse,
  Settings, Building, Key, LogOut, ChevronDown, Moon, Sun, Menu, X
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
import WebManagementAdminView from './views/WebManagementAdminView';
import WebApplicationsAdminView from './views/WebApplicationsAdminView';

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
import HealthAndSafetyAdminView from './views/HealthAndSafetyAdminView';
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

/**
 * Sidebar navigasyonu.
 *
 * Gruplar ise gore dizilir: once gunluk kullanilan ozet, sonra gun icinde en
 * cok dokunulan gecis/yoklama akisi, ardindan akademik, kisiler, iletisim,
 * kampus hizmetleri, web ve en altta idari guvenlik.
 */
const NAV_GROUPS = [
  {
    title: 'Genel',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/nova-ai', icon: BrainCircuit, label: 'Yapay Zeka Merkezi' }
    ]
  },
  {
    title: 'Geçiş & Yoklama',
    items: [
      { to: '/qr', icon: QrCode, label: 'QR Geçiş Sistemi' },
      { to: '/live-attendance', icon: RadioTower, label: 'Canlı Geçiş Takibi' },
      { to: '/student-gate', icon: DoorOpen, label: 'Manuel Geçiş' },
      { to: '/health-safety', icon: HeartPulse, label: 'Revir & Güvenlik Masası' },
      { to: '/attendance', icon: CalendarX2, label: 'Devamsızlık' },
      { to: '/daily-absences', icon: ClipboardList, label: 'Günlük Rapor' }
    ]
  },
  {
    title: 'Akademik',
    items: [
      { to: '/teachers', icon: UserSquare, label: 'Öğretmenler' },
      { to: '/grades', icon: FileEdit, label: 'Not Yönetimi' },
      { to: '/counseling', icon: HeartHandshake, label: 'Rehberlik & Psikoloji' }
    ]
  },
  {
    title: 'Kişiler',
    items: [
      { to: '/users', icon: Users, label: 'Kullanıcılar' },
      { to: '/approvals', icon: UserCheck, label: 'Onay Bekleyenler' }
    ]
  },
  {
    title: 'İletişim',
    items: [
      { to: '/announcements', icon: Megaphone, label: 'Duyurular' },
      { to: '/push', icon: BellRing, label: 'Bildirim Merkezi' },
      { to: '/chat', icon: MessageSquare, label: 'Yönetici Chat' }
    ]
  },
  {
    title: 'Kampüs Hizmetleri',
    items: [
      { to: '/appointments', icon: CalendarClock, label: 'Randevu Yönetimi' },
      { to: '/transport', icon: Bus, label: 'Servis Yönetimi' },
      { to: '/cafeteria', icon: Coffee, label: 'Kafeterya Menüsü' }
    ]
  },
  {
    title: 'Web & Başvurular',
    items: [
      { to: '/web-management', icon: Globe, label: 'Okul Web Yönetimi' },
      { to: '/web-applications', icon: Inbox, label: 'Başvurular & Mesajlar' }
    ]
  },
  {
    title: 'Güvenlik',
    items: [
      { to: '/cheats', icon: ShieldAlert, label: 'İhlal Tespitleri' },
      { to: '/device-management', icon: Smartphone, label: 'Cihaz Yönetimi' }
    ]
  }
];

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
        className="sidebar-header relative flex items-center gap-2.5 pt-10 pb-4 px-4 select-none"
      >
        <img src="/logo-4327.png" alt="" className="h-8 w-8 object-contain rounded-md shrink-0" />

        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[14px] font-semibold text-slate-900 dark:text-white leading-tight tracking-[-0.01em] truncate">Boğaziçi Koleji</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate">Yönetim Sistemi</span>
        </div>

        <button
          aria-label="Hızlı ayarlar"
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <ChevronDown size={15} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {dropdownOpen && (
          <div className="absolute top-[92%] left-3 right-3 mt-1 bg-white dark:bg-[#0f172a] rounded-xl p-1 z-[100] shadow-lg border border-slate-200 dark:border-white/10 flex flex-col gap-0.5 origin-top animate-in fade-in zoom-in-95 duration-150">
            <button onClick={(e) => { e.stopPropagation(); document.documentElement.classList.toggle('dark'); const isDark = document.documentElement.classList.contains('dark'); document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light'); localStorage.setItem('app-theme', isDark ? 'dark' : 'light'); }} className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white text-left w-full cursor-pointer"><Sun size={16} className="hidden dark:block" /><Moon size={16} className="block dark:hidden" /> Tema Değiştir</button>
            <NavLink to="/settings" className={({isActive}) => `no-underline flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><Settings size={16} /> Ayarlar</NavLink>
            <NavLink to="/institution-settings" className={({isActive}) => `no-underline flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><Building size={16} /> Kurum Kuralları</NavLink>
            <NavLink to="/security" className={({isActive}) => `no-underline flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><ShieldAlert size={16} /> Sistem Logları</NavLink>
            <NavLink to="/profile" className={({isActive}) => `no-underline flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${isActive ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'}`} onClick={(e) => { e.stopPropagation(); onClose(); }}><Key size={16} /> Yönetici Profili</NavLink>
          </div>
        )}
      </div>
      <div className="sidebar-content">
        {NAV_GROUPS.map(group => (
          <div className="sidebar-section" key={group.title}>
            <div className="sidebar-section-title">{group.title}</div>
            {group.items.map(item => (
              <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} onClick={onClose} />
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <button
          onClick={() => getAuth().signOut()}
          className="w-full h-9 px-2.5 flex items-center gap-2.5 rounded-lg text-[13px] font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <LogOut size={16} className="shrink-0" />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </div>
    </>
  );
};

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
                <img src="/logo-4327.png" alt="Logo" className="h-8 w-auto drop-shadow-sm dark:drop-shadow-md rounded-md" />
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
              
              <Route path="/announcements" element={<RequireLicense requiredPath="/announcements"><AnnouncementsAdminView /></RequireLicense>} />
              <Route path="/device-management" element={<RequireLicense requiredPath="/student-gate"><DeviceManagementView /></RequireLicense>} />

              <Route path="/cafeteria" element={<RequireLicense requiredPath="/cafeteria"><CafeteriaAdminView /></RequireLicense>} />
              <Route path="/appointments" element={<RequireLicense requiredPath="/appointments"><AppointmentsAdminView /></RequireLicense>} />
              <Route path="/transport" element={<RequireLicense requiredPath="/transport"><TransportAdminView /></RequireLicense>} />
              <Route path="/counseling" element={<RequireLicense requiredPath="/counseling"><CounselingAdminView /></RequireLicense>} />
              <Route path="/chat" element={<RequireLicense requiredPath="/chat"><ChatView /></RequireLicense>} />
              <Route path="/web-applications" element={<RequireLicense requiredPath="/settings"><WebApplicationsAdminView /></RequireLicense>} />
              <Route path="/web-management" element={<RequireLicense requiredPath="/settings"><WebManagementAdminView /></RequireLicense>} />
              <Route path="/settings" element={<RequireLicense requiredPath="/settings"><SettingsView /></RequireLicense>} />
              <Route path="/institution-settings" element={<RequireLicense requiredPath="/settings"><InstitutionSettingsAdminView /></RequireLicense>} />
              <Route path="/security" element={<RequireLicense requiredPath="/security"><SecurityLogsView /></RequireLicense>} />
              <Route path="/push" element={<RequireLicense requiredPath="/push"><PushNotificationAdminView /></RequireLicense>} />
              <Route path="/student-gate" element={<RequireLicense requiredPath="/student-gate"><StudentGateAdminView /></RequireLicense>} />
              <Route path="/health-safety" element={<RequireLicense requiredPath="/student-gate"><HealthAndSafetyAdminView /></RequireLicense>} />
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
