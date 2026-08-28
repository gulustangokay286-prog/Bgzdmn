import React, { useState, useMemo } from 'react';
import { Search, Check, X, UserCircle } from 'lucide-react';
import { Input, Select, EmptyState } from './ui/panel';
import { cx, eyebrow, hairline } from './ui/tokens';

const CLASS_OPTIONS = ['Tümü', '9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf'];

/**
 * Ana-detay ekranlarının sol sütunu: aranabilir kişi listesi.
 * Not Yönetimi, Devamsızlık, Rehberlik ve Kasa ekranları paylaşır.
 */
const StudentSearch = ({ users, selectedId, onSelect, viewMode = 'student' }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedClass, setSelectedClass] = useState('Tümü');

  const filteredUsers = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return users.filter((u) => {
      if (viewMode === 'student' && selectedClass !== 'Tümü') {
        const branchStr = u.fields?.branch?.stringValue || '';
        if (!branchStr.includes(selectedClass.replace('. Sınıf', ''))) return false;
      }
      if (!query) return true;
      const name = (u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || '').toLowerCase();
      const no = (u.fields?.school_number?.stringValue || u.fields?.schoolNumber?.stringValue || '').toLowerCase();
      return name.includes(query) || no.includes(query);
    });
  }, [users, searchText, selectedClass, viewMode]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={cx('shrink-0 px-4 py-3.5 border-b flex flex-col gap-2.5', hairline)}>
        <div className="flex items-center justify-between gap-2">
          <span className={eyebrow}>{viewMode === 'student' ? 'Öğrenciler' : 'Personel'}</span>
          <span className="text-[11.5px] text-slate-400 dark:text-slate-500 tnum">{filteredUsers.length}</span>
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            placeholder={viewMode === 'student' ? 'İsim veya okul no' : 'İsim ara'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              aria-label="Aramayı temizle"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {viewMode === 'student' && (
          <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto panel-scroll min-h-0 p-2">
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={UserCircle}
            title="Sonuç yok"
            description="Arama veya sınıf filtresini değiştirin."
          />
        ) : (
          filteredUsers.map((user) => {
            const id = user.name.split('/').pop();
            const name = user.fields?.full_name?.stringValue || user.fields?.fullName?.stringValue || 'İsimsiz Kişi';
            const no = user.fields?.school_number?.stringValue || user.fields?.schoolNumber?.stringValue || '—';
            const branch = user.fields?.branch?.stringValue || '—';
            const role = user.fields?.role?.stringValue || '—';
            const isSelected = selectedId === id;

            return (
              <button
                key={user.name}
                onClick={() => onSelect(id, viewMode === 'student' ? `${name} (${no})` : name)}
                className={cx(
                  'w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors',
                  isSelected
                    ? 'bg-[#991b1b]/[0.08] dark:bg-rose-500/10'
                    : 'hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                )}
              >
                <span className="min-w-0">
                  <span
                    className={cx(
                      'block text-[13px] font-medium truncate',
                      isSelected ? 'text-[#991b1b] dark:text-rose-300' : 'text-slate-800 dark:text-slate-100'
                    )}
                  >
                    {name}
                  </span>
                  <span className="block mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                    {viewMode === 'student' ? `No ${no} · ${branch}` : role}
                  </span>
                </span>
                {isSelected && <Check size={15} className="shrink-0 text-[#991b1b] dark:text-rose-300" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StudentSearch;
