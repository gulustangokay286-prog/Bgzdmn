const fs = require('fs');
let code = fs.readFileSync('src/views/ChatView.jsx', 'utf8');

// 1. Overall wrapper
code = code.replace(
  'className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden bg-white dark:bg-[#0f172a]"',
  'className="absolute inset-0 z-30 flex-1 flex flex-col font-sans overflow-hidden bg-[#0b1120]"'
);
// Remove the inner wrapper since we made it absolute
code = code.replace(
  '<div className="w-full h-full mx-auto bg-white dark:bg-[#0f172a] overflow-hidden flex">',
  '<div className="w-full h-full mx-auto bg-[#0b1120] overflow-hidden flex">'
);

// 2. Left Panel
code = code.replace(
  'className={`${activeUser ? \'hidden md:flex\' : \'flex\'} w-full md:w-[380px] bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-white/10 flex-col h-full shrink-0`}',
  'className={`${activeUser ? \'hidden md:flex\' : \'flex\'} w-full md:w-[380px] bg-[#0b1120] border-r border-slate-800/80 flex-col h-full shrink-0`}'
);

// Left Header
code = code.replace(
  'h-[70px] bg-[#F0F2F5] dark:bg-[#202c33] px-4 flex items-center justify-between border-b border-slate-200 dark:border-white/10',
  'h-[70px] bg-[#131c31] px-4 flex items-center justify-between border-b border-slate-800/80'
);

// Left Header icons
code = code.replace(/text-slate-500 hover:text-slate-700 dark:text-slate-300/g, 'text-slate-300 hover:text-white transition-colors');
code = code.replace(/hover:bg-slate-200/g, 'hover:bg-slate-800');

// Search Bar area
code = code.replace(
  'className="p-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]"',
  'className="p-3 border-b border-slate-800/80 bg-[#0b1120]"'
);
code = code.replace(
  'bg-[#F0F2F5] dark:bg-[#202c33] rounded-lg flex items-center px-4 py-2',
  'bg-[#1e293b] rounded-xl flex items-center px-4 py-2 border border-slate-700/60'
);
code = code.replace(
  'text-[#111b21] dark:text-[#e9edef] placeholder:text-[#8696a0]',
  'text-slate-200 placeholder:text-slate-500 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0'
);

// User List
code = code.replace(
  'className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-[#0f172a]"',
  'className="flex-1 overflow-y-auto custom-scrollbar bg-[#0b1120]"'
);
code = code.replace(
  'className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${isActive ? \'bg-[#F0F2F5] dark:bg-[#2a3942]\' : \'hover:bg-[#F5F6F6] dark:hover:bg-[#2a3942]\'} border-b border-slate-200 dark:border-white/10 last:border-0`}',
  'className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${isActive ? \'bg-[#1e293b]\' : \'hover:bg-slate-800/50\'} border-b border-slate-800/50 last:border-0`}'
);
code = code.replace(/text-slate-800 dark:text-slate-200/g, 'text-slate-200');

// 3. Right Panel (Chat Area)
code = code.replace(
  'className={`${activeUser ? \'flex\' : \'hidden md:flex\'} flex-1 flex-col bg-[#EFEAE2] dark:bg-[#0b141a] h-full relative`}',
  'className={`${activeUser ? \'flex\' : \'hidden md:flex\'} flex-1 flex-col bg-[#080d1a] h-full relative`}'
);

// Right Header
code = code.replace(
  'h-[70px] bg-[#F0F2F5] dark:bg-[#202c33] px-4 md:px-6 flex items-center justify-between border-b border-slate-200 dark:border-white/10 shrink-0 z-30',
  'h-[70px] bg-[#131c31] px-4 md:px-6 flex items-center justify-between border-b border-slate-800/80 shrink-0 z-30 shadow-sm'
);

// Right Header icons (force white as user requested "search buton ve diğeri beyaz olmalıdır")
code = code.replace(
  'className={`p-2 rounded-full transition-colors ${showSearch ? \'bg-slate-200 text-slate-700 dark:text-slate-300\' : \'hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300\'}`}',
  'className={`p-2 rounded-full transition-colors ${showSearch ? \'bg-slate-700 text-white\' : \'text-white hover:bg-slate-700/50\'}`}'
);
code = code.replace(
  'className="p-2 rounded-full transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300"',
  'className="p-2 rounded-full transition-colors text-white hover:bg-slate-700/50"'
);

// Message Search Bar
code = code.replace(
  'className="bg-white dark:bg-[#0f172a] px-4 py-2 border-b border-slate-200 dark:border-white/10 z-20 flex items-center shadow-sm shrink-0"',
  'className="bg-[#0f172a] px-4 py-2 border-b border-slate-800 z-20 flex items-center shadow-md shrink-0"'
);
code = code.replace(
  'className="flex-1 bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg flex items-center px-4 py-1.5"',
  'className="flex-1 bg-[#1e293b] rounded-xl flex items-center px-4 py-2 border border-slate-700/60"'
);

// Encryption Badge
code = code.replace(
  'className="bg-[#FFEECD] dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[12.5px] px-3.5 py-1.5 rounded-lg shadow-sm"',
  'className="bg-[#1e293b]/90 border border-slate-700/60 text-slate-300 text-[11.5px] font-medium px-4 py-1.5 rounded-full shadow-sm backdrop-blur-md inline-flex items-center gap-1.5"'
);

// Chat Bubbles Container
code = code.replace(
  'className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-[8%] py-6 flex flex-col gap-2 z-10 relative"',
  'className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-[8%] py-6 flex flex-col gap-2.5 z-10 relative bg-[#080d1a]"'
);

// Chat Bubbles
code = code.replace(
  'className={`relative px-2.5 py-1.5 rounded-lg shadow-sm min-w-[80px] max-w-full ${isMe ? \'bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none\' : \'bg-white dark:bg-[#202c33] rounded-tl-none\'}`}',
  'className={`relative px-3 py-2 rounded-2xl shadow-sm min-w-[80px] max-w-full ${isMe ? \'bg-[#005c4b] rounded-tr-none\' : \'bg-[#1e293b] rounded-tl-none\'}`}'
);
code = code.replace(
  'className="text-[#111b21] dark:text-[#e9edef] leading-[19px] whitespace-pre-wrap break-words pr-14 pb-1"',
  'className="text-slate-100 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words pr-14 pb-1"'
);
code = code.replace(
  'className={`absolute bottom-1 right-2 flex items-center gap-1 text-[11px] ${isMe ? \'text-[#54656f] dark:text-[#8696a0]\' : \'text-[#54656f] dark:text-[#8696a0]\'}`}',
  'className={`absolute bottom-1.5 right-2 flex items-center gap-1 text-[11px] text-white/70`}'
);
code = code.replace(
  'className={`absolute top-0 w-3 h-3 ${isMe ? \'-right-2 text-[#d9fdd3] dark:text-[#005c4b]\' : \'-left-2 text-white dark:text-[#202c33]\'}`}',
  'className={`absolute top-0 w-3 h-3 ${isMe ? \'-right-2 text-[#005c4b]\' : \'-left-2 text-[#1e293b]\'}`}'
);

// Input Area
code = code.replace(
  'className="bg-[#f0f2f5] dark:bg-[#202c33] px-4 py-2.5 flex items-center gap-4 z-20 shrink-0"',
  'className="bg-[#080d1a] px-3 py-2.5 flex flex-col gap-2 z-20 shrink-0 relative"'
);
// Replace input form container
code = code.replace(
  '<form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-4">',
  '<form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2.5">'
);
code = code.replace(
  'className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg flex items-center px-4 py-2.5 shadow-sm"',
  'className="flex-1 bg-[#1e293b] rounded-full flex items-center px-4 py-2 border border-slate-700/30"'
);

// Empty State
code = code.replace(
  'className="w-full h-full flex flex-col items-center justify-center bg-[#F0F2F5] dark:bg-[#202c33] relative border-b-[6px] border-[#00A884]"',
  'className="w-full h-full flex flex-col items-center justify-center bg-[#080d1a] relative border-b-[6px] border-indigo-500"'
);

fs.writeFileSync('src/views/ChatView.jsx', code);
