const fs = require('fs');
let code = fs.readFileSync('src/views/ChatView.jsx', 'utf8');

// Imports
code = code.replace(
  "import { db } from '../services/firebaseConfig';",
  "import { db, rtdb } from '../services/firebaseConfig';\nimport { ref, onValue, set, onDisconnect, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';"
);

// State hooks
code = code.replace(
  "const [messageSearchQuery, setMessageSearchQuery] = useState('');",
  "const [messageSearchQuery, setMessageSearchQuery] = useState('');\n  const [partnerStatus, setPartnerStatus] = useState(null);\n  const [partnerTyping, setPartnerTyping] = useState(false);\n  const typingTimeoutRef = useRef(null);"
);

// Presence effect
const presenceEffect = `
  // Presence Effect
  useEffect(() => {
    if (!adminId || adminId === 'admin_fallback') return;
    
    const userStatusRef = ref(rtdb, \`/status/\${adminId}\`);
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
`;

code = code.replace(
  "// Adminin dahil olduğu tüm",
  presenceEffect + "\n\n  // Adminin dahil olduğu tüm"
);

// Active User RTDB effect
const partnerEffect = `
  // RTDB Listener for Partner Status and Typing
  useEffect(() => {
    if (!activeUser || !activeConversationId) {
      setPartnerStatus(null);
      setPartnerTyping(false);
      return;
    }
    const userId = activeUser.name.split('/').pop();
    
    const statusRef = ref(rtdb, \`/status/\${userId}\`);
    const typingRef = ref(rtdb, \`/typing/\${activeConversationId}/\${userId}\`);

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
`;

code = code.replace(
  "// Find or listen to conversation when active user changes",
  partnerEffect + "\n\n  // Find or listen to conversation when active user changes"
);

// handleTyping function
const handleTypingFn = `
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!activeConversationId || !adminId) return;

    set(ref(rtdb, \`/typing/\${activeConversationId}/\${adminId}\`), true);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      set(ref(rtdb, \`/typing/\${activeConversationId}/\${adminId}\`), false);
    }, 2000);
  };
`;

code = code.replace(
  "const handleSendMessage = async (e) => {",
  handleTypingFn + "\n\n  const handleSendMessage = async (e) => {"
);

// onChange in input
code = code.replace(
  "onChange={(e) => setNewMessage(e.target.value)}",
  "onChange={handleTyping}"
);

// handleSendMessage clear typing
code = code.replace(
  "setNewMessage('');",
  "setNewMessage('');\n    if (activeConversationId) set(ref(rtdb, \`/typing/\${activeConversationId}/\${adminId}\`), false);\n    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);"
);

// Format RTDB timestamp in formatTime (since RTDB uses normal ms timestamp integer)
code = code.replace(
  "const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);",
  "const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);"
);

// --- DARK MODE FIXES --- //
// 239: bg-[#F0F2F5] -> bg-[#F0F2F5] dark:bg-[#202c33]
code = code.replace(
  "bg-[#F0F2F5] px-4 flex items-center justify-between border-b",
  "bg-[#F0F2F5] dark:bg-[#202c33] px-4 flex items-center justify-between border-b"
);

// 274: bg-[#F0F2F5] -> bg-[#F0F2F5] dark:bg-[#202c33]
code = code.replace(
  "bg-[#F0F2F5] rounded-lg flex items-center px-4 py-2",
  "bg-[#F0F2F5] dark:bg-[#202c33] rounded-lg flex items-center px-4 py-2"
);

// 310: hover:bg-[#F5F6F6] ... bg-[#F0F2F5]
code = code.replace(
  "transition-colors ${isActive ? 'bg-[#F0F2F5]' : 'hover:bg-[#F5F6F6]'}",
  "transition-colors ${isActive ? 'bg-[#F0F2F5] dark:bg-[#2a3942]' : 'hover:bg-[#F5F6F6] dark:hover:bg-[#2a3942]'}"
);

// 329: flex-1 flex-col bg-[#EFEAE2] h-full
code = code.replace(
  "flex-1 flex-col bg-[#EFEAE2] h-full relative",
  "flex-1 flex-col bg-[#EFEAE2] dark:bg-[#0b141a] h-full relative"
);

// 333: bg-[#F0F2F5] px-4 md:px-6
code = code.replace(
  "h-[70px] bg-[#F0F2F5] px-4 md:px-6 flex items-center justify-between",
  "h-[70px] bg-[#F0F2F5] dark:bg-[#202c33] px-4 md:px-6 flex items-center justify-between"
);

// Partner Status in Header
code = code.replace(
  "{(activeUser.fields?.role?.stringValue || 'Bilinmiyor')}",
  "{partnerTyping ? <span className=\\\"text-emerald-500 font-medium\\\">yazıyor...</span> : partnerStatus && partnerStatus.state === 'online' ? <span className=\\\"text-slate-600 dark:text-slate-400\\\">Çevrimiçi</span> : partnerStatus && partnerStatus.last_changed ? <span className=\\\"text-slate-500\\\">Son görülme: {formatTime(partnerStatus.last_changed)}</span> : (activeUser.fields?.role?.stringValue || 'Bilinmiyor')}"
);
// In case the template string is raw in JS:
// Ah, the file has `{activeUser.fields?.role?.stringValue || 'Bilinmiyor'}` not inside template literal!
code = code.replace(
  "{activeUser.fields?.role?.stringValue || 'Bilinmiyor'}",
  "{partnerTyping ? <span className=\\\"text-emerald-500 font-medium\\\">yazıyor...</span> : partnerStatus && partnerStatus.state === 'online' ? <span className=\\\"text-slate-600 dark:text-slate-400\\\">Çevrimiçi</span> : partnerStatus && partnerStatus.last_changed ? <span className=\\\"text-slate-500\\\">Son görülme: {formatTime(partnerStatus.last_changed)}</span> : (activeUser.fields?.role?.stringValue || 'Bilinmiyor')}"
);

// 376: bg-[#f0f2f5] rounded-lg
code = code.replace(
  "bg-[#f0f2f5] rounded-lg flex items-center px-4 py-1.5",
  "bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg flex items-center px-4 py-1.5"
);
// text-[#111b21] dark:text-[#e9edef]
code = code.replace(
  "text-[#111b21] placeholder:text-[#8696a0]",
  "text-[#111b21] dark:text-[#e9edef] placeholder:text-[#8696a0]"
);

// bg-[#FFEECD] dark:bg-[#182229]
code = code.replace(
  "bg-[#FFEECD] text-[#54656f]",
  "bg-[#FFEECD] dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0]"
);

// Bubbles
code = code.replace(
  "bg-[#d9fdd3] rounded-tr-none' : 'bg-white dark:bg-[#0f172a] rounded-tl-none",
  "bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none' : 'bg-white dark:bg-[#202c33] rounded-tl-none"
);

// Arrow colors
code = code.replace(
  "'-right-2 text-[#d9fdd3]' : '-left-2 text-slate-900 dark:text-white'",
  "'-right-2 text-[#d9fdd3] dark:text-[#005c4b]' : '-left-2 text-white dark:text-[#202c33]'"
);

// Text colors in bubble
code = code.replace(
  "text-[#111b21] leading-[19px] whitespace-pre-wrap break-words pr-14 pb-1",
  "text-[#111b21] dark:text-[#e9edef] leading-[19px] whitespace-pre-wrap break-words pr-14 pb-1"
);

// Input area
code = code.replace(
  "bg-[#f0f2f5] px-4 py-2.5 flex items-center gap-4 z-20 shrink-0",
  "bg-[#f0f2f5] dark:bg-[#202c33] px-4 py-2.5 flex items-center gap-4 z-20 shrink-0"
);

code = code.replace(
  "bg-white dark:bg-[#0f172a] rounded-lg flex items-center px-4 py-2.5 shadow-sm",
  "bg-white dark:bg-[#2a3942] rounded-lg flex items-center px-4 py-2.5 shadow-sm"
);

// Input text
code = code.replace(
  "text-[#111b21] placeholder:text-[#8696a0]",
  "text-[#111b21] dark:text-[#e9edef] placeholder:text-[#8696a0]"
);

// Empty state
code = code.replace(
  "bg-[#F0F2F5] relative border-b-[6px] border-[#00A884]",
  "bg-[#F0F2F5] dark:bg-[#202c33] relative border-b-[6px] border-[#00A884]"
);
code = code.replace(
  "text-[#41525d] mb-4",
  "text-[#41525d] dark:text-[#e9edef] mb-4"
);

fs.writeFileSync('src/views/ChatView.jsx', code);
