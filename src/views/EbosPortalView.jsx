import React, { useState } from 'react';
import { 
    Building2, Wallet, Landmark, 
    UserPlus, Calculator, Coins, CheckCircle, 
    Briefcase, FileText, Settings, ShieldAlert,
    ChevronRight, ArrowRightLeft, CreditCard, ArrowLeft,
    Users, BookOpen, PieChart, Lock, FilePlus, Receipt
} from 'lucide-react';
import PersonnelView from './PersonnelView';
import CashRegisterView from './CashRegisterView';
import BankManagementView from './BankManagementView';
import FinanceDefinitionsView from './FinanceDefinitionsView';
import FinanceReportsView from './FinanceReportsView';
import InvoiceManagementView from './InvoiceManagementView';
import SystemParametersView from './SystemParametersView';

import UsersView from './UsersView';
import AttendanceAdminView from './AttendanceAdminView';
import GradesAdminView from './GradesAdminView';
import CounselingAdminView from './CounselingAdminView';

const EbosPortalView = () => {
    const [topMenu, setTopMenu] = useState('kurum'); 
    const [leftMenu, setLeftMenu] = useState('personel'); 
    const [activeModule, setActiveModule] = useState(null);

    const handleTopMenuChange = (menu) => {
        setTopMenu(menu);
        setActiveModule(null);
        if(menu === 'kurum') setLeftMenu('personel');
        if(menu === 'kasa') setLeftMenu('islem');
        if(menu === 'banka') setLeftMenu('hesap');
    };

    const handleLeftMenuChange = (menu) => {
        setLeftMenu(menu);
        setActiveModule(null);
    };

    const getLeftMenuItems = () => {
        if(topMenu === 'kurum') return [
            { id: 'tanimlar', label: 'Tanımlamalar' },
            { id: 'ogrenci', label: 'Öğrenci Yönetimi' },
            { id: 'personel', label: 'Personel Yönetimi' },
            { id: 'devam', label: 'Devam/Devamsızlık Sistemi' },
            { id: 'rehberlik', label: 'Rehberlik / Anketler' },
            { id: 'sinavlar', label: 'Sınavlar ve Notlar' }
        ];
        if(topMenu === 'kasa') return [
            { id: 'islem', label: 'Kasa İşlemleri' },
            { id: 'fatura', label: 'Fatura ve İrsaliye' },
            { id: 'tanim', label: 'Kasa Tanımları' },
            { id: 'raporlar', label: 'Raporlar' }
        ];
        if(topMenu === 'banka') return [
            { id: 'hesap', label: 'Banka İşlemleri' },
            { id: 'raporlar', label: 'Raporlar' }
        ];
        return [];
    };

    const currentMenuLabel = getLeftMenuItems().find(m => m.id === leftMenu)?.label || leftMenu;

    const renderActionIcons = () => {
        if(topMenu === 'kurum' && leftMenu === 'personel') {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 p-4 md:p-8">
                    <ActionIcon icon={UserPlus} label="Personel Kayıt İşlemi" onClick={() => setActiveModule('personnel_list')} />
                    <ActionIcon icon={Calculator} label="Bordro & Kesinti İşlemleri" onClick={() => setActiveModule('personnel_payroll')} />
                    <ActionIcon icon={CheckCircle} label="Personel Hakediş İşlemi" onClick={() => setActiveModule('personnel_payroll')} />
                    <ActionIcon icon={Coins} label="Personel Maaş Ödeme İşlemi" onClick={() => setActiveModule('personnel_payroll')} />
                    <ActionIcon icon={Briefcase} label="Öğretmen Saatlik Maaş Ödemesi" onClick={() => setActiveModule('personnel_hourly')} />
                    <ActionIcon icon={FileText} label="Eğitim Danışmanı Prim Hesabı" onClick={() => setActiveModule('personnel_bonus')} />
                    <ActionIcon icon={PieChart} label="Raporlar" onClick={() => setActiveModule('finance_reports')} />
                </div>
            );
        }
        if(topMenu === 'kurum' && leftMenu === 'tanimlar') {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 p-4 md:p-8">
                    <ActionIcon icon={Settings} label="Gelir/Gider Tanımları" onClick={() => setActiveModule('finance_defs')} />
                    <ActionIcon icon={ShieldAlert} label="Sistem Parametreleri" onClick={() => setActiveModule('system_params')} />
                </div>
            );
        }
        if(topMenu === 'kurum' && leftMenu === 'ogrenci') {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 p-4 md:p-8">
                    <ActionIcon icon={Users} label="Tüm Öğrenciler" onClick={() => setActiveModule('ogrenci_yonetim')} />
                </div>
            );
        }
        if(topMenu === 'kurum' && leftMenu === 'devam') {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 p-4 md:p-8">
                    <ActionIcon icon={CheckCircle} label="Yoklama İşlemleri" onClick={() => setActiveModule('devam_yonetim')} />
                </div>
            );
        }
        if(topMenu === 'kurum' && leftMenu === 'rehberlik') {
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 p-8">
                    <ActionIcon icon={BookOpen} label="Rehberlik Sistemi" onClick={() => setActiveModule('rehberlik_yonetim')} />
                </div>
            );
        }
        if(topMenu === 'kurum' && leftMenu === 'sinavlar') {
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 p-8">
                    <ActionIcon icon={FileText} label="Sınav Notları" onClick={() => setActiveModule('sinav_yonetim')} />
                </div>
            );
        }

        if(topMenu === 'kasa' && leftMenu === 'islem') {
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 p-8">
                    <ActionIcon icon={ArrowRightLeft} label="Kasa Giriş / Çıkış" onClick={() => setActiveModule('cash_transactions')} />
                    <ActionIcon icon={Lock} label="Kasa Açma / Kapatma" onClick={() => setActiveModule('cash_session')} />
                    <ActionIcon icon={Users} label="Öğrenci Tahsilat" onClick={() => setActiveModule('cash_student')} />
                </div>
            );
        }
        if(topMenu === 'kasa' && leftMenu === 'fatura') {
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 p-8">
                    <ActionIcon icon={Receipt} label="Fatura Kes / İptal" onClick={() => setActiveModule('fatura_yonetim')} />
                </div>
            );
        }
        if(topMenu === 'kasa' && leftMenu === 'tanim') {
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 p-8">
                    <ActionIcon icon={FilePlus} label="Kasa Tanımları" onClick={() => setActiveModule('cash_defs')} />
                </div>
            );
        }
        if((topMenu === 'kasa' || topMenu === 'banka') && leftMenu === 'raporlar') {
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 p-8">
                    <ActionIcon icon={PieChart} label="Genel Raporlar" onClick={() => setActiveModule('finance_reports')} />
                </div>
            );
        }

        if(topMenu === 'banka' && leftMenu === 'hesap') {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 p-4 md:p-8">
                    <ActionIcon icon={Landmark} label="Hesap Tanımları" onClick={() => setActiveModule('bank_accounts')} />
                    <ActionIcon icon={RefreshCcw} label="Havale / EFT İşlemleri" onClick={() => setActiveModule('bank_transactions')} />
                    <ActionIcon icon={ArrowRightLeft} label="Virman (Transfer)" onClick={() => setActiveModule('bank_virman')} />
                    <ActionIcon icon={CreditCard} label="POS Çekimleri" onClick={() => setActiveModule('bank_pos')} />
                    <ActionIcon icon={FileText} label="Çek / Senet Takibi" onClick={() => setActiveModule('bank_checks')} />
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400">
                <BookOpen size={64} className="mb-4 opacity-50" />
                <h2 className="text-xl font-bold">Modül Yüklenemedi</h2>
            </div>
        );
    };

    const renderActiveModule = () => {
        
        if(activeModule === 'finance_defs') return <FinanceDefinitionsView onClose={() => setActiveModule(null)} />;
        if(activeModule === 'system_params') return <SystemParametersView onClose={() => setActiveModule(null)} />;
        if(activeModule === 'finance_reports') return <FinanceReportsView onClose={() => setActiveModule(null)} />;
        if(activeModule === 'fatura_yonetim') return <InvoiceManagementView onClose={() => setActiveModule(null)} />;
        if(activeModule?.startsWith('personnel_')) return <PersonnelView initialTab={activeModule.split('_')[1]} onClose={() => setActiveModule(null)} />;
        if(activeModule?.startsWith('cash_')) return <CashRegisterView initialTab={activeModule.split('_')[1]} onClose={() => setActiveModule(null)} />;
        if(activeModule?.startsWith('bank_')) return <BankManagementView initialTab={activeModule.split('_')[1]} onClose={() => setActiveModule(null)} />;
        
        if(activeModule === 'ogrenci_yonetim') return <UsersView />;
        if(activeModule === 'devam_yonetim') return <AttendanceAdminView />;
        if(activeModule === 'sinav_yonetim') return <GradesAdminView />;
        if(activeModule === 'rehberlik_yonetim') return <CounselingAdminView />;

        return null;
    };

    if (activeModule) {
        return (
            <div className="relative w-full h-full bg-[#0b1120] flex flex-col font-sans transition-colors">
                { }
                <div className="px-8 py-4 bg-[#0b1120] text-white flex items-center gap-4 shrink-0 border-b border-slate-700/80 z-10">
                    <button 
                        onClick={() => setActiveModule(null)} 
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[13px] font-bold cursor-pointer group py-1 px-2 -ml-2 rounded-lg hover:bg-slate-800/50"
                    >
                        <ArrowLeft size={16} className="text-slate-400 group-hover:text-white transition-colors" />
                        <span>Portala Dön</span>
                    </button>
                    <div className="h-4 w-px bg-slate-700/80 mx-1"></div>
                    <div className="font-bold tracking-wide text-[15px] text-white uppercase">{currentMenuLabel}</div>
                </div>
                <div className="flex-1 relative overflow-hidden bg-[#0b1120]">
                    {renderActiveModule()}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden transition-colors bg-[#f8fafc] dark:bg-[#0b1120]">
            { }
            <div className="w-full flex flex-col md:flex-row items-center justify-between px-8 py-6 bg-[#0b1120] border-b border-slate-700/80 shrink-0 z-20">
                <div className="flex items-center gap-4 mb-6 md:mb-0">
                    <span className="text-[16px] font-extrabold text-white tracking-widest uppercase">Pivot Portal</span>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-6 md:gap-16">
                    <TopMenuIcon active={topMenu === 'kurum'} onClick={() => handleTopMenuChange('kurum')} IconComponent={Building2} label="KURUM" />
                    <TopMenuIcon active={topMenu === 'kasa'} onClick={() => handleTopMenuChange('kasa')} IconComponent={Wallet} label="KASA" />
                    <TopMenuIcon active={topMenu === 'banka'} onClick={() => handleTopMenuChange('banka')} IconComponent={Landmark} label="BANKA" />
                </div>

                <div className="flex items-center gap-8 mt-6 md:mt-0">
                    <a 
                        href="https://wa.me/13435993157" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-slate-500 cursor-pointer hover:text-white transition-colors uppercase tracking-widest no-underline"
                    >
                        Teknik Destek
                    </a>
                    { }
                    <div className="flex items-center gap-3 invisible select-none pointer-events-none">
                        <Users size={16} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Admin</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                { }
                <div className="w-full md:w-[260px] bg-[#0b1120] border-r border-slate-700/80 flex flex-col shrink-0 max-h-[40vh] md:max-h-full">
                    <div className="flex-1 overflow-y-auto py-6 px-6 flex flex-row md:flex-col custom-scrollbar gap-2">
                        {getLeftMenuItems().map(item => (
                            <button 
                                key={item.id}
                                onClick={() => handleLeftMenuChange(item.id)}
                                className={`whitespace-nowrap md:whitespace-normal md:w-full text-left py-2 text-[13px] font-bold transition-all flex items-center gap-3 ${leftMenu === item.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                { }
                <div className="flex-1 overflow-y-auto bg-[#0b1120] custom-scrollbar flex flex-col">
                    <div className="px-8 py-6 shrink-0">
                        <h1 className="text-[28px] font-bold text-white tracking-tight">{currentMenuLabel}</h1>
                        <p className="text-[13px] text-slate-400 mt-1">İlgili işlemleri aşağıdan seçerek yönetebilirsiniz.</p>
                    </div>
                    { }
                    <div className="h-px w-full bg-slate-700/80"></div>
                    <div className="flex-1 p-2">
                        {renderActionIcons()}
                    </div>
                </div>
            </div>

            { }
            <div className="h-8 bg-[#0f172a] border-t border-slate-700/80 flex items-center justify-between px-6 text-[11px] font-bold text-slate-500 shrink-0">
                <div className="flex items-center gap-6">
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> Sistem Aktif</span>
                    <span>Versiyon 4.0.0 (V4)</span>
                </div>
                <div className="flex items-center gap-6 hidden sm:flex">
                    <span>Makine: IAL-MAIN</span>
                    <span>Dönem: 2024-2025</span>
                </div>
            </div>
        </div>
    );
};

const ActionIcon = ({ icon: Icon, label, onClick }) => (
    <div 
        onClick={onClick}
        className="flex flex-col items-center justify-start gap-4 p-2 cursor-pointer group transition-transform duration-300 hover:scale-105"
    >
        <div className="w-16 h-16 flex items-center justify-center text-slate-500 group-hover:text-white transition-colors duration-300">
            <Icon size={40} strokeWidth={1} />
        </div>
        <span className="text-[12px] font-bold text-center text-slate-500 leading-tight group-hover:text-white transition-colors max-w-[120px]">{label}</span>
    </div>
);

const TopMenuIcon = ({ active, onClick, IconComponent, label }) => (
    <div 
        onClick={onClick}
        className={`flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group ${active ? 'opacity-100 scale-105' : 'opacity-50 hover:opacity-100'}`}
    >
        <div className={`mb-2 transition-all duration-300 ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'}`}>
            <IconComponent size={32} strokeWidth={1.5} />
        </div>
        <span className={`font-black tracking-widest text-[11px] transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'}`}>{label}</span>
    </div>
);

export default EbosPortalView;
