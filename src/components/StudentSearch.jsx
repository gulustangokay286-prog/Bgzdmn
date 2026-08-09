import React, { useState, useMemo } from 'react';
import { Search, CheckCircle, UserCircle, Filter } from 'lucide-react';

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
    <div className="flex flex-col gap-4 w-full h-full">
      <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>{viewMode === 'student' ? 'Öğrenci Seçimi' : 'Personel Seçimi'}</h3>
        
        <div className="flex-col gap-3">
          <div className="flex items-center gap-2" style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', marginBottom: viewMode === 'student' ? '12px' : '0' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder={viewMode === 'student' ? "İsim veya Okul No ile ara..." : "İsim ile ara..."}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ border: 'none', background: 'transparent', flex: 1, padding: 0, boxShadow: 'none' }}
            />
          </div>
          
          {viewMode === 'student' && (
            <div className="flex items-center gap-2" style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
              <Filter size={16} className="text-muted" />
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ border: 'none', background: 'transparent', padding: 0, flex: 1, boxShadow: 'none', color: 'var(--text-secondary)' }}>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
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
                style={{
                  padding: '12px 16px',
                  marginBottom: '4px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: isSelected ? '#FFF1F2' : 'transparent',
                  border: isSelected ? '1px solid #FECDD3' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: isSelected ? '500' : '400', color: isSelected ? 'var(--accent-red)' : 'var(--text-primary)' }}>{name}</div>
                  <div style={{ fontSize: '12px', color: isSelected ? '#F43F5E' : 'var(--text-muted)' }}>
                    {viewMode === 'student' ? `Okul No: ${no} • Sınıf: ${branch}` : `Rol: ${role}`}
                  </div>
                </div>
                {isSelected && <CheckCircle size={18} className="text-red" />}
              </div>
            );
          })
        ) : (
          <div className="flex-col items-center justify-center gap-3 h-full text-muted">
            <UserCircle size={40} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: '14px' }}>Kritere uygun kişi bulunamadı.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentSearch;
