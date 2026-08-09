import sys

with open('src/App.jsx', 'r') as f:
    content = f.read()

# 1. Import Menu and X
content = content.replace("PieChart\n} from 'lucide-react';", "PieChart,\n  Menu, X\n} from 'lucide-react';")

# 2. Modify Sidebar to accept isOpen and onClose
sidebar_old = """const Sidebar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);"""
sidebar_new = """const Sidebar = ({ isOpen, onClose }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);"""
content = content.replace(sidebar_old, sidebar_new)

# 3. Add mobile overlay and transition classes to Sidebar wrapper
sidebar_wrapper_old = """  return (
    <div className="sidebar">
      <div className="drag-region-top" />"""
sidebar_wrapper_new = """  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[90] md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}
      <div className={`sidebar fixed inset-y-0 left-0 z-[100] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button onClick={onClose} className="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white bg-white/5 p-2 rounded-full z-[110]">
          <X size={20} />
        </button>
        <div className="drag-region-top hidden md:block" />"""
content = content.replace(sidebar_wrapper_old, sidebar_wrapper_new)

# 4. Close the fragment in Sidebar
sidebar_end_old = """      </div>
    </div>
  );
};"""
sidebar_end_new = """      </div>
    </div>
    </>
  );
};"""
content = content.replace(sidebar_end_old, sidebar_end_new)

# 5. App Component state and Mobile Header
app_old = """const App = () => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {"""
app_new = """const App = () => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setMobileMenuOpen(false);
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {"""
content = content.replace(app_old, app_new)

app_render_old = """  return (
    <ThemeProvider>
      <Router>
        <div className="app-container">
          <Sidebar />
          <div className="main-content">
            <div className="drag-region-top" />
            <div style={{ position: 'relative', padding: '40px 30px', height: '100%', boxSizing: 'border-box', overflowY: 'auto', backgroundColor: 'var(--bg-base)' }}>"""
app_render_new = """  return (
    <ThemeProvider>
      <Router>
        <div className="app-container">
          <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
          <div className="main-content bg-[var(--bg-base)] flex flex-col relative w-full">
            <div className="drag-region-top hidden md:block" />
            
            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between px-4 pt-12 pb-4 bg-[var(--bg-sidebar)] border-b border-slate-200 dark:border-white/5 sticky top-0 z-40 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-3">
                <button onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                  <Menu size={24} />
                </button>
                <img src={logo} alt="Logo" className="h-7 w-auto drop-shadow-sm dark:drop-shadow-md brightness-0 dark:brightness-110" />
              </div>
              <div className="font-bold text-[15px] text-slate-800 dark:text-white tracking-wide">Pivot Akademi</div>
            </div>

            <div className="relative px-4 pt-6 pb-24 md:p-8 min-h-full box-border" onClick={() => setMobileMenuOpen(false)}>"""
content = content.replace(app_render_old, app_render_new)

with open('src/App.jsx', 'w') as f:
    f.write(content)

