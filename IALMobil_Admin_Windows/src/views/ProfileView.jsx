import React, { useState, useEffect, useRef } from 'react';
import { Key, Mail, Phone, Calendar, ShieldCheck, MapPin, Award, Camera, Loader2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

const ProfileView = () => {
  const [adminName, setAdminName] = useState('Muharrem Özkan');
  const [profileImage, setProfileImage] = useState(null);
  const [email, setEmail] = useState('admin@bogazici.edu.tr');
  const [phone, setPhone] = useState('+90 (555) 123 45 67');
  const [location, setLocation] = useState('Merkez Kampüs');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    if (currentUser) {
      if (currentUser.displayName) {
        setAdminName(currentUser.displayName);
      }
      
      const fetchProfile = async () => {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const imageUrl = data.profile_image || data.profileImageUrl || data.profileImage;
            if (imageUrl) {
              setProfileImage(imageUrl);
            }
            if (data.email) setEmail(data.email);
            if (data.phone) setPhone(data.phone);
            if (data.location) setLocation(data.location);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      };
      
      fetchProfile();
    } else {
      const storedName = localStorage.getItem('adminName');
      if (storedName) {
        setAdminName(storedName);
      }
    }
  }, []);

  const handleSaveField = async (field, value) => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), {
          [field]: value
        }, { merge: true });
      } catch (error) {
        console.error(`Error saving ${field}:`, error);
      }
    }
  };

  const handleAvatarClick = () => {
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'ml_default');
      formData.append('folder', "bgz-mobil");

      const response = await fetch('https://api.cloudinary.com/v1_1/dbfhcj6px/image/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Cloudinary upload failed');
      }

      const data = await response.json();
      const imageUrl = data.secure_url;

      setProfileImage(imageUrl);

      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        await setDoc(doc(db, 'users', currentUser.uid), {
          profile_image: imageUrl,
          profileImageUrl: imageUrl
        }, { merge: true });
      }
      
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Fotoğraf yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto font-sans flex flex-col p-8 md:p-12 lg:px-24">
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-8">
        
        { }
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 pb-8 border-b border-slate-200 dark:border-white/10">
          
          <div 
            onClick={handleAvatarClick}
            className="relative w-32 h-32 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[48px] font-extrabold shadow-sm cursor-pointer group overflow-hidden border-4 border-white"
          >
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              adminName.charAt(0).toUpperCase()
            )}
            
            { }
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isUploading ? (
                <Loader2 className="w-8 h-8 text-slate-900 dark:text-white animate-spin" />
              ) : (
                <Camera className="w-8 h-8 text-slate-900 dark:text-white" />
              )}
            </div>
            
            { }
            {isUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 text-slate-900 dark:text-white animate-spin" />
              </div>
            )}
          </div>
          
          { }
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
          
          <div className="flex-1 flex flex-col text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <h1 className="text-[32px] font-bold text-slate-900 dark:text-white tracking-tight">{adminName}</h1>
              <span className="bg-amber-100 text-amber-700 px-3 py-1 text-[12px] font-bold uppercase tracking-widest rounded-full flex items-center gap-1.5">
                <Award size={14} /> TIER 1
              </span>
            </div>
            <p className="text-[15px] text-slate-500 font-medium">Nihai Sistem Yöneticisi</p>
          </div>
        </div>

        { }
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm p-8 flex flex-col gap-6">
            <h2 className="text-[16px] font-bold text-slate-800 dark:text-slate-200">İletişim Bilgileri</h2>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                <Mail size={18} />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">E-Posta</span>
                <input 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => handleSaveField('email', e.target.value)}
                  className="text-[15px] font-medium text-slate-800 dark:text-slate-200 bg-transparent outline-none border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors w-full py-0.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                <Phone size={18} />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Telefon</span>
                <input 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={(e) => handleSaveField('phone', e.target.value)}
                  className="text-[15px] font-medium text-slate-800 dark:text-slate-200 bg-transparent outline-none border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors w-full py-0.5"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                <MapPin size={18} />
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Konum</span>
                <input 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={(e) => handleSaveField('location', e.target.value)}
                  className="text-[15px] font-medium text-slate-800 dark:text-slate-200 bg-transparent outline-none border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors w-full py-0.5"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm p-8 flex flex-col gap-6">
            <h2 className="text-[16px] font-bold text-slate-800 dark:text-slate-200">Sistem Bilgileri</h2>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                <ShieldCheck size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Yetki Seviyesi</span>
                <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">Tam Erişim (Read/Write/Delete)</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400">
                <Calendar size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Son Giriş</span>
                <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">Bugün, 08:45</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400">
                <Key size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Şifre Değişimi</span>
                <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">45 gün önce</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProfileView;
