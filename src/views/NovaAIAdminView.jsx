import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar, Plus, Send, MoreHorizontal, PanelLeftClose, PanelLeftOpen, ArrowUp, Sparkles, BadgeCheck } from 'lucide-react';
import { aiService } from '../services/aiService';
import { getAuth } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, push, set, get, update, onValue } from 'firebase/database';
import { db, rtdb } from '../services/firebaseConfig';
import novaAiIcon from '../assets/nova_ai_icon.png';

const formatMarkdown = (text) => {
  if (!text) return '';
  // HTML Escape to prevent XSS via AI Prompt Injection (Stored XSS)
  let escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  let html = escapedText
    .replace(/####\s+(.*)/g, '<b class="text-[17px] font-bold text-slate-800 dark:text-slate-100 block mt-3 mb-1">$1</b>')
    .replace(/###\s+(.*)/g, '<b class="text-lg font-bold text-slate-800 dark:text-slate-100 block mt-3 mb-1">$1</b>')
    .replace(/##\s+(.*)/g, '<b class="text-xl font-bold text-slate-800 dark:text-slate-100 block mt-4 mb-2">$1</b>')
    .replace(/#\s+(.*)/g, '<b class="text-2xl font-bold text-slate-800 dark:text-slate-100 block mt-4 mb-2">$1</b>')
    .replace(/\*\*(.*?)\*\*/g, '<b class="font-bold text-slate-800 dark:text-slate-100">$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>');
  return html;
};

const NovaAIAdminView = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  
  
  const [isThinking, setIsThinking] = useState(false);
  
  const [isTyping, setIsTyping] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [adminName, setAdminName] = useState('Admin Kullanıcısı');
  
  // Animated hero text state
  const [heroText, setHeroText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const heroAnimRef = useRef(null);

  const suggestions = [
    "12. Sınıflar için motivasyon konuşması hazırla",
    "Bu haftaki devamsızlık raporunu özetle",
    "Velilere gönderilecek toplantı davetiyesi yaz",
    "Öğrencilerin okul içi disiplin analizini oluştur",
    "Sınav sonuçlarını analiz et ve rapor hazırla",
    "Öğretmen toplantı gündemi oluştur",
  ];

  // ChatGPT-style typing animation for hero
  useEffect(() => {
    if (messages.length > 0 || isTyping || isThinking) return;
    
    let cancelled = false;
    let idx = 0;
    
    const animate = async () => {
      while (!cancelled) {
        const text = suggestions[idx % suggestions.length];
        
        // Type forward
        for (let i = 0; i <= text.length; i++) {
          if (cancelled) return;
          setHeroText(text.slice(0, i));
          await new Promise(r => setTimeout(r, 40 + Math.random() * 30));
        }
        
        // Pause
        await new Promise(r => setTimeout(r, 2000));
        if (cancelled) return;
        
        // Delete backward
        for (let i = text.length; i >= 0; i--) {
          if (cancelled) return;
          setHeroText(text.slice(0, i));
          await new Promise(r => setTimeout(r, 20));
        }
        
        // Small pause before next
        await new Promise(r => setTimeout(r, 400));
        idx++;
      }
    };
    
    animate();
    return () => { cancelled = true; };
  }, [messages.length, isTyping, isThinking]);

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => setShowCursor(prev => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    
    if (prompt) {
      el.style.height = 'auto';
      const exactHeight = el.scrollHeight;
      
      if (exactHeight > 96) {
        el.style.height = '96px';
        el.style.overflow = 'auto';
      } else {
        el.style.height = `${exactHeight}px`;
        el.style.overflow = 'hidden';
      }
    } else {
      el.style.height = 'auto';
      el.style.overflow = 'hidden';
    }
  }, [prompt]);

  useEffect(() => {
    const auth = getAuth();
    const currentUser = auth?.currentUser;
    if (currentUser?.displayName) {
      setAdminName(currentUser.displayName);
    } else {
      const storedName = localStorage.getItem('adminName');
      if (storedName) setAdminName(storedName);
    }

    if (currentUser) {
      const chatsRef = ref(rtdb, `nova_ai_chats/${currentUser.uid}`);
      
      const unsubscribe = onValue(chatsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const chats = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          // En yeni güncellenen en üstte olacak şekilde sırala
          chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          setChatHistory(chats);
        } else {
          setChatHistory([]);
        }
      });

      return () => unsubscribe();
    }
  }, []);

  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    if (messages.length > 0 || isThinking || isTyping) {
      scrollToBottom();
    }
  }, [messages.length, isThinking]);

  const simulateTyping = async (fullText) => {
    setTypingText('');
    setIsTyping(true);
    
    let currentText = '';
    const chunks = fullText.split(' ');
    
    for (let i = 0; i < chunks.length; i++) {
      currentText += chunks[i] + ' ';
      setTypingText(currentText);
      
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
        if (isAtBottom && i % 3 === 0) {
          scrollToBottom(true);
        }
      }
      
      await new Promise(res => setTimeout(res, Math.random() * 30 + 10)); 
    }
    
    setIsTyping(false);
    setTypingText('');
    return currentText;
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || isTyping || isThinking) return;

    const userMsg = prompt.trim();
    setPrompt('');
    
    const userMessageObj = { role: 'user', content: userMsg };
    setMessages(prev => [...prev, userMessageObj]);
    setTimeout(() => scrollToBottom(), 50);

    setIsThinking(true);

    const auth = getAuth();
    const currentUser = auth?.currentUser;
    let currentChatId = activeChatId;

    if (!currentChatId && currentUser) {
      try {
        const newChatRef = push(ref(rtdb, `nova_ai_chats/${currentUser.uid}`));
        currentChatId = newChatRef.key;
        await set(newChatRef, {
          userId: currentUser.uid,
          title: userMsg.substring(0, 30) + (userMsg.length > 30 ? '...' : ''),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [userMessageObj]
        });
        setActiveChatId(currentChatId);
      } catch (err) {
        console.error("Error creating chat in RTDB:", err);
      }
    } else if (currentChatId && currentUser) {
      try {
        const chatRef = ref(rtdb, `nova_ai_chats/${currentUser.uid}/${currentChatId}`);
        const snapshot = await get(chatRef);
        if (snapshot.exists()) {
          const currentMsgs = snapshot.val().messages || [];
          await update(chatRef, {
            messages: [...currentMsgs, userMessageObj],
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error("Error updating chat in RTDB:", err);
      }
    }

    try {
      const response = await aiService.generateContent(`Sen "Nova AI" adında bir eğitim yönetimi yapay zeka asistanısın. Şu isteğe profesyonel ve kısa cevap ver: ${userMsg}`);
      setIsThinking(false);
      await simulateTyping(response);
      
      const assistantMessageObj = { role: 'assistant', content: response };
      setMessages(prev => [...prev, assistantMessageObj]);

      if (currentChatId && currentUser) {
        try {
          const chatRef = ref(rtdb, `nova_ai_chats/${currentUser.uid}/${currentChatId}`);
          const snapshot = await get(chatRef);
          if (snapshot.exists()) {
            const currentMsgs = snapshot.val().messages || [];
            await update(chatRef, {
              messages: [...currentMsgs, assistantMessageObj],
              updatedAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error("Error updating chat with AI response in RTDB:", err);
        }
      }
    } catch (error) {
      setIsThinking(false);
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Bir hata oluştu: ${error.message}` }]);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setTypingText('');
    setIsTyping(false);
    setIsThinking(false);
    setPrompt('');
  };

  const loadChat = (chatId) => {
    setActiveChatId(chatId);
    setTypingText('');
    setIsTyping(false);
    setIsThinking(false);
    setPrompt('');
    
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages || []);
    }
  };

  const setSuggestion = (text) => {
    setPrompt(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const isEmptyState = messages.length === 0 && !isTyping && !isThinking;

  const mobilePortalContainer = document.getElementById('nova-ai-mobile-portal');

  const mobileSidebarButton = (
    <button 
      onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
      className="p-1.5 -ml-1 cursor-pointer text-slate-500 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors inline-flex"
    >
      {isSidebarOpen ? <PanelLeftClose size={22} /> : <PanelLeftOpen size={22} />}
    </button>
  );

  return (
    <div className="absolute -inset-x-4 -top-4 -bottom-6 md:relative md:inset-auto md:w-full md:flex-1 md:h-full flex bg-white dark:bg-[#0f172a] overflow-hidden text-slate-800 dark:text-slate-200 font-sans md:rounded-[32px] md:shadow-sm md:border md:border-slate-200 dark:md:border-white/10 z-10 rounded-none border-none">
      
      {/* Mobile Portal */}
      {mobilePortalContainer && createPortal(mobileSidebarButton, mobilePortalContainer)}

      {}
      <div className={`absolute md:relative z-40 shrink-0 bg-[#f9f9f9] dark:bg-[#0b1120] border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out overflow-hidden h-full ${isSidebarOpen ? 'w-[260px]' : 'w-0'}`}>
        <div className="w-[260px] flex flex-col h-full">
        <div className="p-3">
          <div 
            onClick={handleNewChat}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-transparent hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2 font-medium text-sm">
              <div className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                 <img src={novaAiIcon} alt="Nova AI" className="w-full h-full object-contain translate-x-[0.55px] translate-y-[2px] dark:brightness-0 dark:invert" />
              </div>
              Yeni Sohbet
            </div>
            <Plus size={16} className="text-slate-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 custom-scrollbar">
          <div className="text-xs font-semibold text-slate-500 mt-4 mb-2 px-2">Sohbet Geçmişi</div>
          {chatHistory.map(chat => (
            <div 
              key={chat.id}
              onClick={() => loadChat(chat.id)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors group mb-1 ${activeChatId === chat.id ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
            >
              <span className="truncate pr-4">{chat.title}</span>
              <MoreHorizontal size={14} className="text-slate-500 opacity-0 group-hover:opacity-100" />
            </div>
          ))}
          {chatHistory.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">Henüz geçmiş sohbet yok.</div>
          )}
        </div>
        
        <div className="p-3 border-t border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-slate-900 dark:text-white flex items-center justify-center font-bold text-sm">
              {adminName.substring(0, 2).toUpperCase()}
            </div>
            <div className="font-semibold text-slate-700 dark:text-slate-300 text-sm flex items-center gap-1.5">
              {adminName}
              <BadgeCheck size={16} className="text-blue-500" />
            </div>
          </div>
        </div>
        </div>
      </div>

      {}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#0f172a] h-full transition-all relative min-w-0">
        
        {}
        {}
        <div className="hidden md:block absolute top-0 left-0 p-3 z-50 pointer-events-none">
          <div 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="p-2 cursor-pointer text-slate-500 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors inline-flex pointer-events-auto shadow-sm md:shadow-none bg-white md:bg-transparent"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </div>
        </div>

        {/* Mobile Overlay for Sidebar */}
        {isSidebarOpen && (
          <div 
            className="md:hidden absolute inset-0 bg-black/50 z-30 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 md:px-8 pt-16 pb-4 custom-scrollbar scroll-smooth">
          
          {isEmptyState ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-28 h-28 rounded-full flex items-center justify-center mb-8 shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                <img src={novaAiIcon} alt="Nova AI" className="w-full h-full object-contain translate-x-[1.05px] translate-y-[5px] dark:brightness-0 dark:invert" />
              </div>
              
              {/* Animated typing hero */}
              <div className="min-h-[48px] md:min-h-[60px] h-auto flex items-center justify-center mb-4 px-4 text-center">
                <span className="text-[22px] md:text-3xl font-bold text-slate-800 dark:text-slate-200 leading-tight md:leading-snug">
                  {heroText}
                  <span 
                    className={`inline-block w-[2px] md:w-[3px] h-5 md:h-8 ml-1 rounded-sm bg-slate-800 dark:bg-slate-200 align-middle ${showCursor ? 'opacity-100' : 'opacity-0'}`}
                    style={{ transition: 'opacity 0.1s', marginTop: '-4px' }}
                  />
                </span>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-6 w-full pb-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-[#f4f4f4] dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-3 rounded-3xl max-w-[75%] text-[15px] leading-relaxed break-words">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="flex gap-4 w-full max-w-3xl">
                      <div className="shrink-0 w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden bg-white dark:bg-slate-800 mt-1 p-[5px]">
                        <img src={novaAiIcon} alt="Nova AI" className="w-full h-full object-contain dark:brightness-0 dark:invert" />
                      </div>
                      <div 
                        className="flex-1 text-slate-800 dark:text-slate-200 text-[15px] leading-relaxed pt-1 whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {}
              {isThinking && (
                <div className="flex gap-4 w-full max-w-3xl animate-pulse">
                  <div className="shrink-0 w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden bg-white dark:bg-slate-800 mt-1 p-[5px]">
                    <img src={novaAiIcon} alt="Nova AI" className="w-full h-full object-contain grayscale opacity-50 dark:brightness-0 dark:invert" />
                  </div>
                  <div className="flex-1 pt-2 space-y-3 max-w-md">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-3/4"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-full"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-5/6"></div>
                  </div>
                </div>
              )}
              
              {}
              {isTyping && !isThinking && (
                <div className="flex gap-4 w-full max-w-3xl">
                  <div className="shrink-0 w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden bg-white dark:bg-slate-800 mt-1 animate-pulse p-[5px]">
                    <img src={novaAiIcon} alt="Nova AI" className="w-full h-full object-contain dark:brightness-0 dark:invert" />
                  </div>
                  <div className="flex-1 text-slate-800 dark:text-slate-200 text-[15px] leading-relaxed pt-1 whitespace-pre-wrap">
                    <span dangerouslySetInnerHTML={{ __html: formatMarkdown(typingText) }} />
                    <span className="inline-block w-2 h-4 ml-1 bg-slate-400 animate-pulse rounded-sm align-middle"></span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </div>

        {}
        <div className="shrink-0 bg-white dark:bg-[#0f172a] pt-2 pb-8 px-6 md:px-8 mt-auto">
          <div className="max-w-3xl mx-auto">
            {/* Horizontal scrollable suggestion chips */}
            {isEmptyState && (
              <div className="flex gap-2 overflow-x-auto pb-3 mb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => setSuggestion(s)}
                    className="shrink-0 cursor-pointer px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-500 transition-all whitespace-nowrap"
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSend} className="relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[32px] py-1 px-2 pl-4 border border-slate-200 dark:border-slate-700 focus-within:border-slate-300 dark:focus-within:border-slate-500 focus-within:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
              <div className="flex-1 flex flex-col justify-center min-h-[32px] py-[2px]">
                <textarea 
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                  placeholder="Nova AI'a ileti gönderin..." 
                  className="nova-ai-input w-full resize-none text-[15px] leading-[24px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent overflow-hidden"
                  rows={1}
                  style={{ minHeight: '24px' }}
                />
              </div>
              <button 
                type="submit" 
                disabled={!prompt.trim() || isTyping || isThinking}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-[2px] border-none outline-none transition-all ${
                  !prompt.trim() || isTyping || isThinking
                    ? 'bg-slate-300 dark:bg-slate-700 text-slate-100 dark:text-slate-500 cursor-not-allowed' 
                    : 'bg-black dark:bg-white text-slate-900 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 shadow-sm'
                }`}
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            </form>
            <div className="text-center mt-3 text-xs text-slate-600 dark:text-slate-400 font-medium">
              Nova AI hata yapabilir. Önemli bilgileri kontrol edin.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default NovaAIAdminView;
