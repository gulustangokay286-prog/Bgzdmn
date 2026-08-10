import React, { useState, useMemo } from 'react';
import { Search, Check, UserCircle, Filter } from 'lucide-react';

const StudentSearch = ({ users, selectedId, onSelect, viewMode = 'student' }) => {
  const [searchText, setSearchText] = useState('');
  const [selectedClass, setSelectedClass] = useState('Tümü');

  const classes = ["Tümü", "9. Sınıf", "10. Sınıf", "11. Sınıf", "12. Sınıf"];

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (viewMode === 'student' && selectedClass !== 'Tümü') {
        const branchStr = u.fields?.branch?.stringValue || '';
        const classNum = selectedClass.replace('. Sınıf', '');
        if (!branchStr.includes(classNum)) return false;
      }

      if (!searchText) return true;
      const name = u.fields?.full_name?.stringValue?.toLowerCase() || u.fields?.fullName?.stringValue?.toLowerCase() || '';
      const no = u.fields?.school_number?.stringValue?.toLowerCase() || u.fields?.schoolNumber?.stringValue?.toLowerCase() || '';
      const query = searchText.toLowerCase();
      return name.includes(query) || no.includes(query);
    });
  }, [users, searchText, selectedClass, viewMode]);

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 shrink-0">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {viewMode === 'student' ? 'Öğrenci Seçimi' : 'Personel Seçimi'}
        </h3>
        
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2.5 transition-colors focus-within:ring-1 focus-within:ring-slate-300 dark:focus-within:ring-white/20">
            <Search size={16} className="text-slate-400 dark:text-slate-400" />
            <input 
              type="text" 
              placeholder={viewMode === 'student' ? "İsim veya No ara..." : "İsim ara..."}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 p-0 text-sm text-slate-900 dark:text-white placeholder:text-slate-500"
            />
          </div>
          
          {viewMode === 'student' && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2.5 transition-colors">
              <Filter size={16} className="text-slate-400 dark:text-slate-400" />
              <select 
                value={selectedClass} 
                onChange={e => setSelectedClass(e.target.value)} 
                className="bg-transparent border-none outline-none flex-1 p-0 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {classes.map(c => <option key={c} value={c} className="bg-white dark:bg-slate-800">{c}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {filteredUsers.length > 0 ? (
          filteredUsers.map(user => {
            const name = user.fields?.full_name?.stringValue || user.fields?.fullName?.stringValue || 'İsimsiz Kişi';
            const no = user.fields?.school_number?.stringValue || user.fields?.schoolNumber?.stringValue || '-';
            const branch = user.fields?.branch?.stringValue || '-';
            const role = user.fields?.role?.stringValue || '-';
            const isSelected = selectedId === user.name.split('/').pop();

            return (
              <div 
                key={user.name}
                onClick={() => onSelect(user.name.split('/').pop(), viewMode === 'student' ? `${name} (${no})` : name)}
                className={`flex justify-between items-center px-4 py-3 mb-1 rounded-xl cursor-pointer transition-colors ${
                  isSelected 
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' 
                    : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-900 dark:text-white'
                }`}
              >
                <div className="flex flex-col">
                  <span className={`text-sm font-medium ${isSelected ? 'text-white dark:text-slate-900' : ''}`}>
                    {name}
                  </span>
                  <span className={`text-xs mt-0.5 ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                    {viewMode === 'student' ? `Okul No: ${no} • Sınıf: ${branch}` : `Rol: ${role}`}
                  </span>
                </div>
                {isSelected && <Check size={18} className="text-white dark:text-slate-900" />}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 h-full text-slate-400 dark:text-slate-500">
            <UserCircle size={32} strokeWidth={1.5} />
            <span className="text-sm font-medium">Sonuç bulunamadı.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentSearch;
