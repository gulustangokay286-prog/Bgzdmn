import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, CheckCircle2, CheckCheck, User, MoreVertical, MessageSquare, Laptop, Smartphone, Lock, X, ArrowLeft, Plus, Smile, Mic } from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { ref, onValue, set, onDisconnect, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, doc, setDoc, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseService } from '../services/firebase';

const ChatView = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeUser, setActiveUser] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [showLeftMenu, setShowLeftMenu] = useState(false);
  const [showRightMenu, setShowRightMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [partnerStatus, setPartnerStatus] = useState(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  
  const messagesEndRef = useRef(null);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const recordingTimerRef = useRef(null);
  
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const adminId = currentUser ? currentUser.uid : 'admin_fallback'; 
  const [adminName, setAdminName] = useState((currentUser && (currentUser.displayName || currentUser.email)) ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'Yetkili');
  const [adminProfileData, setAdminProfileData] = useState(null);

  useEffect(() => {
    if (!adminId || adminId === 'admin_fallback') return;
    const unsubscribe = onSnapshot(doc(db, 'users', adminId), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setAdminProfileData({ fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { stringValue: String(v) }])) });
        const fetchedName = d.name || d.fullName || d.full_name || d.displayName;
        if (fetchedName) {
          setAdminName(fetchedName);
        }
      }
    });
    return () => unsubscribe();
  }, [adminId]);

  useEffect(() => {
    const loadUsers = async () => {
      const allUsers = await firebaseService.fetchAllUsers();
      setUsers(allUsers);
      setFilteredUsers(allUsers);
      setLoading(false);
    };
    loadUsers();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(users);
    } else {
      const lowerQ = searchQuery.toLowerCase();
      setFilteredUsers(users.filter(u => {
        const name = (u.fields?.fullName?.stringValue || u.fields?.full_name?.stringValue || '').toLowerCase();
        return name.includes(lowerQ);
      }));
    }
  }, [searchQuery, users]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [adminConversations, setAdminConversations] = useState([]);

  useEffect(() => {
    if (!adminId || adminId === 'admin_fallback') return;
    
    const userStatusRef = ref(rtdb, `/status/${adminId}`);
    const isOfflineForDatabase = { state: 'offline', last_changed: rtdbServerTimestamp() };
    const isOnlineForDatabase = { state: 'online', last_changed: rtdbServerTimestamp() };

    const connectedRef = ref(rtdb, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(userStatusRef).set(isOfflineForDatabase).then(() => {
          set(userStatusRef, isOnlineForDatabase);
        });
      }
    });

    return () => {
      unsubscribe();
      set(userStatusRef, isOfflineForDatabase);
    };
  }, [adminId]);

  useEffect(() => {
    if (!adminId || adminId === 'admin_fallback') return;
    
    const q = query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', adminId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdminConversations(convos);
    });
    
    return () => unsubscribe();
  }, [adminId]);

  useEffect(() => {
    if (!activeUser || !activeConversationId) {
      setPartnerStatus(null);
      setPartnerTyping(false);
      return;
    }
    const userId = activeUser.name.split('/').pop();
    
    const statusRef = ref(rtdb, `/status/${userId}`);
    const typingRef = ref(rtdb, `/typing/${activeConversationId}/${userId}`);

    const unsubStatus = onValue(statusRef, (snapshot) => {
      setPartnerStatus(snapshot.val());
    });
    
    const unsubTyping = onValue(typingRef, (snapshot) => {
      setPartnerTyping(!!snapshot.val());
    });

    return () => {
      unsubStatus();
      unsubTyping();
    };
  }, [activeUser, activeConversationId]);

  useEffect(() => {
    if (!activeUser) return;
    
    setMessages([]);
    let unsubscribeMessages = () => {};
    
    const findConversation = () => {
      try {
        const userId = activeUser.name.split('/').pop();
        
        const existingConvo = adminConversations.find(c => c.participantIds && c.participantIds.includes(userId));

        if (existingConvo) {
          setActiveConversationId(existingConvo.id);
          
          const msgsQuery = query(
            collection(db, `conversations/${existingConvo.id}/messages`), 
            orderBy('createdAt', 'asc')
          );
          
          unsubscribeMessages = onSnapshot(msgsQuery, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setMessages(msgs);
            setTimeout(scrollToBottom, 50);
          });
        } else {
          setActiveConversationId(null);
        }
      } catch (error) {
        console.error("Konuşma aranırken hata:", error);
      }
    };

    findConversation();
    return () => unsubscribeMessages();
  }, [activeUser, adminConversations]);

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!activeConversationId || !adminId) return;

    set(ref(rtdb, `/typing/${activeConversationId}/${adminId}`), true);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      set(ref(rtdb, `/typing/${activeConversationId}/${adminId}`), false);
    }, 2000);
  };

  const uploadFileToCloudinary = async (file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default');
    formData.append('folder', 'ial-mobil/chat');

    const resourceType = type === 'audio' || type === 'video' ? 'video' : 'auto';
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/dbfhcj6px/${resourceType}/upload`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Cloudinary upload failed');
      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
        setSelectedFile(file);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Mic access denied:", error);
      alert("Mikrofon erişimi reddedildi.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !activeUser) return;

    const partnerId = activeUser.name.split('/').pop() || activeUser.id || activeUser.uid;
    const convoId = activeConversationId || [adminId, partnerId].sort().join('_');
    const content = newMessage.trim();
    const currentFile = selectedFile;
    
    setNewMessage('');
    setSelectedFile(null);

    if (activeConversationId) set(ref(rtdb, `/typing/${activeConversationId}/${adminId}`), false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    const userId = activeUser.name.split('/').pop();
    let finalConvoId = activeConversationId;

    let msgType = 'text';
    let filePreviewUrl = null;
    if (currentFile) {
      if (currentFile.type.startsWith('image/')) msgType = 'image';
      else if (currentFile.type.startsWith('audio/')) msgType = 'audio';
      else if (currentFile.type.startsWith('video/')) msgType = 'video';
      else msgType = 'file';
      try {
        filePreviewUrl = URL.createObjectURL(currentFile);
      } catch (err) {}
    }

    const tempId = 'temp_' + Date.now();
    const tempMsg = {
      id: tempId,
      conversationId: finalConvoId || 'pending',
      senderId: adminId,
      type: msgType,
      content: content,
      fileUrl: filePreviewUrl,
      createdAt: new Date(),
      deliveryState: 'sending',
      isOptimistic: true
    };

    setPendingMessages(prev => [...prev, tempMsg]);
    setTimeout(scrollToBottom, 20);

    try {
      let fileUrl = null;
      if (currentFile) {
        fileUrl = await uploadFileToCloudinary(currentFile, msgType);
      }

      if (!finalConvoId) {
        const newConvoRef = await addDoc(collection(db, 'conversations'), {
          participantIds: [adminId, userId],
          participantRoles: { [adminId]: 'admin', [userId]: 'user' },
          latestMessage: content,
          latestMessageTimestamp: serverTimestamp(),
          latestMessageSenderId: adminId,
          unreadCounts: { [userId]: 1, [adminId]: 0 },
          updatedAt: serverTimestamp()
        });
        finalConvoId = newConvoRef.id;
        setActiveConversationId(finalConvoId);
        
        const msgsQuery = query(
          collection(db, `conversations/${finalConvoId}/messages`), 
          orderBy('createdAt', 'asc')
        );
        onSnapshot(msgsQuery, (snapshot) => {
          const msgs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setMessages(msgs);
          setTimeout(scrollToBottom, 50);
        });
      }

      const msgObj = {
        conversationId: finalConvoId,
        senderId: adminId,
        type: msgType,
        content: content,
        fileUrl: fileUrl || filePreviewUrl,
        createdAt: serverTimestamp(),
        deliveryState: 'sent',
        readBy: [adminId]
      };
      
      await addDoc(collection(db, `conversations/${finalConvoId}/messages`), msgObj);
      
      await updateDoc(doc(db, `conversations`, finalConvoId), {
        latestMessage: msgType === 'text' ? content : (msgType === 'audio' ? '🎤 Sesli Mesaj' : (msgType === 'image' ? '📷 Fotoğraf' : '📁 Dosya')),
        latestMessageTimestamp: serverTimestamp(),
        latestMessageSenderId: adminId,
        updatedAt: serverTimestamp(),
        deletedBy: []
      });
      
    } catch (error) {
      console.error('Mesaj gönderme hatası:', error);
    } finally {
      
      setTimeout(() => {
        setPendingMessages(prev => prev.filter(m => m.id !== tempId));
      }, 400);
    }
  };

  const handleClearChat = async () => {
    if (!activeConversationId) return;
    const confirmClear = window.confirm("Bu sohbetteki mesajları silmek istediğinize emin misiniz? (Bu işlem sohbeti sizin için temizler)");
    if (!confirmClear) return;

    try {
      
      const convoDoc = await getDocs(query(collection(db, `conversations`), where("__name__", "==", activeConversationId)));
      if (!convoDoc.empty) {
        const docData = convoDoc.docs[0].data();
        const currentDeletedBy = docData.deletedBy || [];
        if (!currentDeletedBy.includes(adminId)) {
          await updateDoc(doc(db, `conversations`, activeConversationId), {
            deletedBy: [...currentDeletedBy, adminId]
          });
        }
      }
      
      setMessages([]);
      setActiveConversationId(null);
      setActiveUser(null);
    } catch (e) {
      console.error(e);
      alert("Sohbet silinirken hata oluştu.");
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '...';
    const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const getAvatarUrl = (u) => {
    if (!u) return null;
    const url = u.avatarUrl || u.avatar || u.photoURL || u.profileImage || u.profile_image || u.profileImageUrl || 
      u.fields?.profile_image?.stringValue || u.fields?.profileImage?.stringValue || u.fields?.profileImageUrl?.stringValue || 
      u.fields?.photoURL?.stringValue || u.fields?.avatarUrl?.stringValue || null;
    if (url && url.startsWith('mockup:')) {
      return '/mockups/' + url.substring(7) + '.png';
    }
    return (url && url !== 'null' && url !== 'undefined' && url.trim() !== '') ? url : null;
  };

  const renderAvatar = (u, name, sizeClass = "w-10 h-10 text-[14px]") => {
    const avatarUrl = getAvatarUrl(u);
    const initial = (name || 'U').charAt(0).toUpperCase();
    
    const roleRaw = (u?.fields?.role?.stringValue || u?.role || '').toLowerCase();
    const isStudent = roleRaw === 'student' || roleRaw === 'öğrenci';
    const isTeacher = roleRaw === 'teacher' || roleRaw === 'öğretmen';
    const genderRaw = (u?.fields?.gender?.stringValue || u?.gender || '').toLowerCase();
    const isFemale = genderRaw === 'kız' || genderRaw === 'kadın' || genderRaw === 'female' || genderRaw === 'kiz';

    const getStudentMockup = () => {
      if (isFemale) {
        const girls = ['/mockups/girl_student_1.png', '/mockups/girl_student_2.png'];
        return girls[name.length % 2];
      }
      const boys = ['/mockups/boy_student_1.png', '/mockups/boy_student_2.png'];
      return boys[name.length % 2];
    };

    if (avatarUrl) {
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden shrink-0 border border-slate-700/60 shadow-sm relative bg-slate-800`}>
          <img 
            src={avatarUrl} 
            alt={name} 
            className="w-full h-full object-cover absolute inset-0 z-10" 
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
            }}
          />
          { }
          <div className="w-full h-full items-center justify-center absolute inset-0 z-0" style={{ display: 'none' }}>
            {isStudent ? (
              <img src={getStudentMockup()} alt="Student Mockup" className="w-full h-full object-cover" />
            ) : isTeacher ? (
              <img src="/mockups/teacher_mockup.png" alt="Teacher Mockup" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold flex items-center justify-center">{initial}</div>
            )}
          </div>
        </div>
      );
    }

    if (isStudent) {
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden shrink-0 border border-slate-700/60 shadow-sm relative bg-slate-800 flex items-center justify-center`}>
          <img 
            src={getStudentMockup()} 
            alt="Profile Mockup" 
            className="w-full h-full object-cover" 
          />
        </div>
      );
    }

    if (isTeacher) {
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden shrink-0 border border-slate-700/60 shadow-sm relative bg-slate-800 flex items-center justify-center`}>
          <img 
            src="/mockups/teacher_mockup.png" 
            alt="Profile Mockup" 
            className="w-full h-full object-cover" 
          />
        </div>
      );
    }

    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold shrink-0 shadow-sm`}>
        {initial}
      </div>
    );
  };

  const [pendingMessages, setPendingMessages] = useState([]);

  const getRoleLabel = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'student' || r === 'öğrenci') return 'Öğrenci';
    if (r === 'teacher' || r === 'öğretmen') return 'Öğretmen';
    if (r === 'parent' || r === 'veli') return 'Veli';
    if (r === 'personnel' || r === 'personel') return 'Personel';
    if (r === 'admin') return 'Yönetici';
    return role || 'Bilinmiyor';
  };

  const getRoleColor = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'student' || r === 'öğrenci') return 'text-blue-400';
    if (r === 'teacher' || r === 'öğretmen') return 'text-purple-400';
    if (r === 'parent' || r === 'veli') return 'text-emerald-400';
    if (r === 'personnel' || r === 'personel') return 'text-teal-400';
    if (r === 'admin') return 'text-amber-400';
    return 'text-slate-500';
  };

  return (
    <div className="absolute inset-0 flex flex-col font-sans overflow-hidden bg-[#0b1120] z-30">
      <div className="w-full h-full mx-auto bg-[#0b1120] overflow-hidden flex">
        
        { }
        <div className={`${activeUser ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] bg-[#0b1120] border-r border-slate-800/80 flex-col h-full shrink-0`}>
          { }
          <div className="h-[70px] bg-[#131c31] px-4 flex items-center justify-between border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              {renderAvatar(adminProfileData, adminName, "w-10 h-10 text-[14px]")}
              <div className="flex flex-col">
                <span className="font-semibold text-slate-200 leading-tight">{adminName}</span>
                <span className="text-[12px] text-slate-500 font-medium">Yönetici Paneli</span>
              </div>
            </div>
            
            <div className="relative">
              <button onClick={() => setShowLeftMenu(!showLeftMenu)} className="text-slate-300 hover:text-white p-2 rounded-full transition-colors hover:bg-slate-800">
                <MoreVertical size={20} />
              </button>
              {showLeftMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLeftMenu(false)} />
                  <div className="absolute right-0 top-12 w-48 bg-[#1e293b] rounded-xl shadow-2xl border border-slate-700/80 py-2 z-50">
                    <button onClick={() => { setShowLeftMenu(false); alert("Özellik yakında eklenecek."); }} className="w-full text-left px-4 py-2 text-[13.5px] text-slate-200 hover:bg-slate-800 font-medium">
                      Profili Düzenle
                    </button>
                    <button onClick={() => { setShowLeftMenu(false); auth.signOut(); }} className="w-full text-left px-4 py-2 text-[13.5px] text-rose-400 hover:bg-slate-800 font-medium">
                      Çıkış Yap
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          { }
          <div className="p-3 border-b border-slate-800/80 bg-[#0b1120]">
            <div className="bg-[#1e293b] rounded-xl flex items-center px-4 py-2 border border-slate-700/60">
              <Search size={18} className="text-slate-400 mr-3 shrink-0" />
              <input
                type="text"
                placeholder="Sohbet veya kişi arayın..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0 text-[14px] text-slate-200 placeholder:text-slate-500"
              />
            </div>
          </div>

          { }
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0b1120]">
            {loading ? (
              <div className="p-4 text-center text-slate-400 text-[13px]">Kişiler yükleniyor...</div>
            ) : filteredUsers.filter(u => {
                const uid = u.name.split('/').pop();
                const r = (u.fields?.role?.stringValue || '').toLowerCase();
                return uid !== adminId && r !== 'admin' && r !== 'yönetici' && r !== 'patron';
              }).length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-[13px]">Kullanıcı bulunamadı.</div>
            ) : (
              filteredUsers
                .filter(u => {
                  const uid = u.name.split('/').pop();
                  const r = (u.fields?.role?.stringValue || '').toLowerCase();
                  return uid !== adminId && r !== 'admin' && r !== 'yönetici' && r !== 'patron';
                })
                .map((user) => {
                const name = user.fields?.fullName?.stringValue || user.fields?.full_name?.stringValue || 'İsimsiz Kullanıcı';
                const role = user.fields?.role?.stringValue || 'Bilinmiyor';
                const isActive = activeUser?.name === user.name;
                const roleLabel = getRoleLabel(role);
                const roleColor = getRoleColor(role);

                return (
                  <div
                    key={user.name}
                    onClick={() => setActiveUser(user)}
                    className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${isActive ? 'bg-[#1e293b]' : 'hover:bg-slate-800/50'} border-b border-slate-800/50 last:border-0`}
                  >
                    {renderAvatar(user, name, "w-12 h-12 text-[16px]")}
                    <div className="flex-1 min-w-0 ml-4">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-[15px] font-semibold text-slate-100 truncate">{name}</span>
                      </div>
                      <div className={`text-[12px] font-bold ${roleColor} tracking-wide`}>{roleLabel}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        { }
        <div className={`${activeUser ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[#080d1a] h-full relative`}>
          {activeUser ? (
            <>
              { }
              <div className="h-[70px] bg-[#131c31] px-4 md:px-6 flex items-center justify-between border-b border-slate-800/80 shrink-0 z-30 shadow-sm">
                <div className="flex items-center gap-3 md:gap-4">
                  <button onClick={() => setActiveUser(null)} className="md:hidden p-2 -ml-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition-colors flex items-center justify-center">
                    <ArrowLeft size={22} />
                  </button>
                  
                  {renderAvatar(activeUser, activeUser.fields?.fullName?.stringValue || activeUser.fields?.full_name?.stringValue || 'U', "w-10 h-10 text-[14px]")}
                  
                  <div>
                    <div className="font-bold text-slate-100 text-[15px] leading-tight">
                      {activeUser.fields?.fullName?.stringValue || activeUser.fields?.full_name?.stringValue || 'İsimsiz Kullanıcı'}
                    </div>
                    <div className="text-[12px] text-slate-400 font-medium">
                      {partnerTyping ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1.5 italic">
                          yazıyor
                          <span className="flex gap-0.5 items-center translate-y-[2px]">
                            <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </span>
                        </span>
                      ) : partnerStatus && partnerStatus.state === 'online' ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                          Çevrimiçi
                        </span>
                      ) : partnerStatus && partnerStatus.last_changed ? (
                        <span className="text-slate-400">Son görülme: {formatTime(partnerStatus.last_changed)}</span>
                      ) : (
                        (activeUser.fields?.role?.stringValue || 'Bilinmiyor')
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 relative">
                  <button onClick={() => { setShowSearch(!showSearch); setMessageSearchQuery(''); setShowRightMenu(false); }} className={`p-2 rounded-full transition-colors ${showSearch ? 'bg-slate-700 text-white' : 'text-white hover:bg-slate-700/50'}`}>
                    <Search size={18} />
                  </button>
                  
                  <div className="relative">
                    <button onClick={() => { setShowRightMenu(!showRightMenu); setShowSearch(false); }} className="p-2 rounded-full transition-colors text-white hover:bg-slate-700/50">
                      <MoreVertical size={18} />
                    </button>
                    {showRightMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowRightMenu(false)} />
                        <div className="absolute right-0 top-12 w-48 bg-[#1e293b] rounded-xl shadow-2xl border border-slate-700/80 py-2 z-50">
                          <button onClick={() => { setShowRightMenu(false); handleClearChat(); }} className="w-full text-left px-4 py-2 text-[13.5px] text-rose-400 hover:bg-slate-800 font-medium">
                            Sohbeti Temizle
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              { }
              {showSearch && (
                <div className="bg-[#0f172a] px-4 py-2.5 border-b border-slate-800 z-20 flex items-center shadow-md shrink-0">
                  <div className="flex-1 bg-[#1e293b] rounded-xl flex items-center px-4 py-2 border border-slate-700/60">
                    <Search size={16} className="text-slate-400 mr-2.5 shrink-0" />
                    <input
                      type="text"
                      placeholder="Bu sohbette ara..."
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      className="flex-1 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0 text-[13.5px] text-slate-100 placeholder:text-slate-500"
                      autoFocus
                    />
                    {messageSearchQuery && (
                      <X size={16} className="text-slate-400 cursor-pointer ml-2 hover:text-white" onClick={() => setMessageSearchQuery('')} />
                    )}
                  </div>
                </div>
              )}

              { }
              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-[8%] py-6 flex flex-col gap-2.5 z-10 relative bg-[#080d1a]">
                
                <div className="text-center mb-6">
                  <span className="bg-[#1e293b]/90 border border-slate-700/60 text-slate-300 text-[11.5px] font-medium px-4 py-1.5 rounded-full shadow-sm backdrop-blur-md inline-flex items-center gap-1.5">
                    <Lock size={12} className="text-indigo-400" />
                    Mesajlarınız uçtan uca şifrelenmektedir.
                  </span>
                </div>

                {!activeConversationId && messages.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-[13.5px] font-medium">
                    Bu kullanıcı ile henüz bir sohbetiniz yok. Başlamak için bir mesaj gönderin.
                  </div>
                )}

                {([...messages, ...pendingMessages.filter(pending => !messages.some(m => m.senderId === pending.senderId && m.content === pending.content && m.type === pending.type))])
                  .filter(msg => !messageSearchQuery || (msg.content && msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())))
                  .map((msg, idx, arr) => {
                    const isMe = msg.senderId === adminId;
                    const nextMsg = arr[idx + 1];
                    const prevMsg = arr[idx - 1];
                    const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId;
                    const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;
                    const showTail = isLastInGroup;
                    const mt = isConsecutive ? 'mt-[3px]' : 'mt-3';

                    const msgKey = msg.id || (msg.createdAt ? String(msg.createdAt) : `temp_${idx}`);
                    const isLast = idx === arr.length - 1;
                    
                    const msgTime = msg.createdAt?.toDate ? msg.createdAt.toDate().getTime() : (msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now());
                    const isRecent = (Date.now() - msgTime) < 3000;
                    
                    const isNew = msg.isOptimistic || (isLast && isRecent);
                    const animClass = isNew ? 'animate-wp-pop' : '';

                    return (
                      <div key={msgKey} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${mt} ${animClass}`}>
                        <div 
                          className="relative max-w-[85%] sm:max-w-[65%] min-w-[92px] rounded-2xl shadow-sm"
                          style={{ 
                            backgroundColor: isMe ? '#005c4b' : '#202c33',
                            marginRight: isMe && !showTail ? 8 : 0,
                            marginLeft: !isMe && !showTail ? 8 : 0
                          }}
                        >
                          { }
                          {showTail && isMe && (
                            <svg width="16" height="18" viewBox="0 0 16 18" className="absolute bottom-[-0.5px] -right-[7px] -z-10" style={{ transform: 'rotate(45deg)' }}>
                              <path d="M 0 2 C 8 11, 13 13, 16 13.5 C 11 16.5, 4 15.5, 0 13.5 Z" fill="#005c4b" />
                            </svg>
                          )}
                          {showTail && !isMe && (
                            <svg width="16" height="18" viewBox="0 0 16 18" className="absolute bottom-[-0.5px] -left-[9.5px] -z-10" style={{ transform: 'rotate(-45deg)' }}>
                              <path d="M 16 2 C 8 11, 3 13, 0 13.5 C 5 16.5, 12 15.5, 16 13.5 Z" fill="#202c33" />
                            </svg>
                          )}

                          <div className={`pl-[10px] pt-[6px] pb-[7px] relative ${msg.type === 'image' || msg.type === 'video' ? 'pr-[10px]' : 'pr-[56px]'}`}>
                            
                            { }
                            {msg.type === 'image' && msg.fileUrl && (
                              <div className="mb-1 relative rounded-lg overflow-hidden group">
                                <img src={msg.fileUrl} alt="attachment" className="max-h-[300px] w-auto object-cover rounded-lg" />
                                <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Plus size={16} className="rotate-45" />
                                </a>
                              </div>
                            )}

                            {msg.type === 'video' && msg.fileUrl && (
                              <div className="mb-1 rounded-lg overflow-hidden">
                                <video src={msg.fileUrl} controls className="max-h-[300px] w-auto rounded-lg" />
                              </div>
                            )}

                            {msg.type === 'audio' && msg.fileUrl && (
                              <div className="mb-1 flex items-center min-w-[200px]">
                                <audio src={msg.fileUrl} controls className="h-10 w-full" />
                              </div>
                            )}

                            {msg.type === 'file' && msg.fileUrl && (
                              <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-3 p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                                <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 flex items-center justify-center rounded-md">
                                  📁
                                </div>
                                <span className="text-sm font-medium text-white truncate max-w-[150px]">
                                  {msg.fileUrl.split('/').pop()}
                                </span>
                              </a>
                            )}

                            {msg.content && (
                              <div className="text-[14.2px] leading-[19px] text-[#e9edef] whitespace-pre-wrap break-words">
                                {msg.content}
                              </div>
                            )}
                            
                            <div className={`absolute bottom-1.5 right-2 flex items-center gap-1 text-[11px] text-white/60`}>
                              <span>{formatTime(msg.createdAt)}</span>
                              {isMe && (
                                <CheckCheck size={14} className={msg.deliveryState === 'read' ? 'text-[#53bdeb]' : 'text-white/50'} />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>

              { }
              <div className="bg-[#080d1a] px-3 py-2.5 flex-col flex gap-2 z-20 shrink-0 relative">
                
                { }
                {selectedFile && (
                  <div className="flex items-center justify-between bg-[#1e293b] p-3 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {selectedFile.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(selectedFile)} alt="preview" className="w-10 h-10 object-cover rounded-md" />
                      ) : (
                        <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 flex items-center justify-center rounded-md">
                          📁
                        </div>
                      )}
                      <div className="text-sm text-slate-200 truncate pr-4">{selectedFile.name}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedFile(null)} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-full">
                      <X size={16} />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                  <button type="button" className="p-2 text-slate-400 hover:text-white transition-colors flex items-center justify-center shrink-0" onClick={() => fileInputRef.current?.click()}>
                    <Plus size={28} strokeWidth={1.5} />
                  </button>
                
                <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2.5">
                  {isRecording ? (
                    <div className="flex-1 bg-red-500/10 rounded-full flex items-center px-4 py-2 border border-red-500/30">
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse mr-3"></div>
                      <span className="text-red-400 text-[15px] font-medium flex-1">
                        Ses kaydediliyor... {formatDuration(recordingTime)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1 bg-[#1e293b] rounded-full flex items-center px-4 py-2 border border-slate-700/30">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={handleTyping}
                        placeholder="Bir mesaj yazın..."
                        className="flex-1 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0 text-[15px] text-slate-100 placeholder:text-slate-500"
                      />
                      <button type="button" className="text-slate-400 hover:text-slate-200 transition-colors ml-2 shrink-0">
                        <Smile size={24} strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
                  
                  {newMessage.trim() || selectedFile ? (
                    <button 
                      type="submit" 
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-md active:scale-95 transition-all flex items-center justify-center shrink-0"
                    >
                      <Send size={20} strokeWidth={1.5} className="ml-0.5" />
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      className={`p-2 transition-colors flex items-center justify-center shrink-0 ${isRecording ? 'text-red-500' : 'text-slate-400 hover:text-white'}`}
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onMouseLeave={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                    >
                      <Mic size={26} strokeWidth={1.5} />
                    </button>
                  )}
                </form>
              </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#080d1a] relative border-b-[6px] border-indigo-500">
              
              { }
              <div className="flex flex-col items-center mb-8 relative z-10">
                <div className="flex items-center justify-center gap-4 text-slate-500 mb-6">
                  <Laptop size={120} strokeWidth={1} />
                  <Smartphone size={80} strokeWidth={1} className="mt-8" />
                </div>
                
                <h2 className="text-[32px] font-light text-slate-200 mb-4">Mesajlaşma Paneli</h2>
                <p className="text-[13.5px] text-slate-400 text-center max-w-md leading-relaxed">
                  İletişim kurmak için soldaki listeden bir kullanıcı seçin veya aratın.<br/>
                  <span className="font-medium">Bilgisayarınızdan anlık olarak</span> öğrenci, veli ve öğretmenlerle sohbet edebilirsiniz.
                </p>
              </div>

              { }
              <div className="absolute bottom-10 flex items-center justify-center gap-1.5 text-[12px] text-slate-500 font-medium w-full">
                <Lock size={12} />
                <span>Uçtan uca şifrelenmiştir</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatView;
