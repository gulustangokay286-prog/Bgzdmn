const fs = require('fs');
let code = fs.readFileSync('src/views/ChatView.jsx', 'utf8');

code = code.replace(
  'className="absolute inset-0 z-30 flex-1 flex flex-col font-sans overflow-hidden bg-[#0b1120]"',
  'className="absolute inset-0 flex flex-col font-sans overflow-hidden bg-[#0b1120] z-30"'
);

// If I missed the first replacement, let's ensure it's absolute inset-0
if (!code.includes('absolute inset-0 flex flex-col font-sans overflow-hidden')) {
  code = code.replace(
    'className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden bg-[#0b1120]"',
    'className="absolute inset-0 flex flex-col font-sans overflow-hidden bg-[#0b1120] z-30"'
  );
}

// Add the Plus, Smile, Mic buttons to the input bar
const inputAreaOld = `              {/* Mesaj Yazma Alanı */}
              <div className="bg-[#080d1a] px-3 py-2.5 flex flex-col gap-2 z-20 shrink-0 relative">
                <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-3">
                  <div className="flex-1 bg-[#1e293b] rounded-full flex items-center px-4 py-2 border border-slate-700/30">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={handleTyping}
                      placeholder="Bir mesaj yazın"
                      className="flex-1 bg-transparent !bg-transparent border-none !border-none outline-none focus:ring-0 !shadow-none text-[15px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#8696a0] p-0 m-0"
                    />
                  </div>
                  {newMessage.trim() ? (
                    <button type="submit" className="text-[#54656f] hover:text-[#111b21] transition-colors p-2 cursor-pointer">
                      <Send size={24} />
                    </button>
                  ) : (
                    <button type="button" disabled className="text-[#8696a0] p-2 opacity-50 cursor-default">
                      <Send size={24} />
                    </button>
                  )}
                </form>
              </div>`;

const inputAreaNew = `              {/* Mesaj Yazma Alanı */}
              <div className="bg-[#080d1a] px-3 py-2.5 flex flex-col gap-2 z-20 shrink-0 relative">
                <div className="flex items-center gap-2.5">
                  <button type="button" className="p-2 text-slate-400 hover:text-white transition-colors flex items-center justify-center shrink-0" onClick={() => alert("Dosya yükleme eklenecek")}>
                    <Plus size={28} strokeWidth={1.5} />
                  </button>
                  
                  <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2.5">
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
                    {newMessage.trim() ? (
                      <button type="submit" className="text-indigo-400 hover:text-indigo-300 transition-colors p-2 cursor-pointer shrink-0 ml-1">
                        <Send size={24} />
                      </button>
                    ) : (
                      <button type="button" className="text-slate-400 hover:text-white transition-colors p-2 cursor-pointer shrink-0 ml-1">
                        <Mic size={24} />
                      </button>
                    )}
                  </form>
                </div>
              </div>`;

code = code.replace(inputAreaOld, inputAreaNew);

fs.writeFileSync('src/views/ChatView.jsx', code);
