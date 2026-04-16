import React, { useState, useContext, useEffect } from 'react';
import { ThemeContext } from './App'; // Assuming you export ThemeContext from App.jsx
import { Sun, Moon, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

// 👇 UPDATED: Added onEmailLogin to the component props
export default function LoginPage({ connectWallet, onEmailLogin }) {
  const { isLight, setIsLight } = useContext(ThemeContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '', visible: false });

  // Update HTML class for dark/light mode background
  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [isLight]);

  const showToastMsg = (message, type = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast({ message: '', type: '', visible: false }), 4000);
  };

  const handleWalletConnect = async () => {
    setIsWalletConnecting(true);
    try {
      await connectWallet();
      showToastMsg('Wallet connected successfully!', 'success');
    } catch (err) {
      showToastMsg('Connection failed. Please try again.', 'error');
    } finally {
      setIsWalletConnecting(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showToastMsg('Please fill in all fields.', 'error');
      return;
    }
    setIsSubmitting(true);
    // Simulate traditional auth API call
    setTimeout(() => {
      showToastMsg('Authentication successful. Loading portal...', 'success');
      setIsSubmitting(false);
      
      // 👇 UPDATED: Call the callback to trigger state change in App.jsx
      if (onEmailLogin) {
        onEmailLogin();
      }
    }, 1200);
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 overflow-hidden relative transition-colors duration-500 neural-bg ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-nl-dark text-white'}`}>
      
      {/* Theme Toggle */}
      <button onClick={() => setIsLight(!isLight)} className="absolute top-6 right-6 p-3 rounded-full bg-nl-panel/80 backdrop-blur border border-gray-800/50 hover:border-nl-accent/50 transition-all z-50">
        {isLight ? <Moon className="w-5 h-5 text-slate-600 hover:text-nl-accent" /> : <Sun className="w-5 h-5 text-nl-accent" />}
      </button>

      {/* Main Container */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center relative z-10">
        
        {/* Left: Brand & Info */}
        <div className="hidden lg:flex flex-col gap-6 animate-in slide-in-from-bottom-8 duration-700 p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-nl-accent to-nl-success flex items-center justify-center shadow-lg shadow-nl-accent/20">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">NeuroLedger</h1>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight leading-tight">Decentralized Neural Identity</h2>
          <p className="text-lg text-slate-600 dark:text-gray-400 leading-relaxed max-w-md">
            Secure, patient-controlled medical records powered by on-chain verification and IPFS encryption. Your data, your keys.
          </p>
          
          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-nl-panel/50 border border-slate-200 dark:border-gray-800/50">
              <div className="w-2 h-2 rounded-full bg-nl-success animate-pulse"></div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Sepolia Live</span>
            </div>
          </div>
        </div>

        {/* Right: Login Card */}
        <div className="animate-in fade-in duration-700 w-full max-w-md mx-auto">
          <div className="glass-panel rounded-3xl p-8 shadow-2xl transition-colors duration-500">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold tracking-tight mb-2">Portal Access</h3>
              <p className="text-sm text-slate-500 dark:text-gray-400">Connect your wallet or enter credentials to sync.</p>
            </div>

            {/* Web3 Connect Button */}
            <button onClick={handleWalletConnect} disabled={isWalletConnecting} className="w-full relative flex items-center justify-center gap-3 bg-nl-accent hover:bg-sky-400 text-nl-dark font-bold py-4 px-6 rounded-2xl transition-all duration-300 btn-glow mb-6 group">
              {isWalletConnecting ? (
                <div className="animate-spin h-5 w-5 border-2 border-nl-dark border-t-transparent rounded-full" />
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>Connect Web3 Wallet</span>
                </>
              )}
            </button>

            <div className="relative flex items-center justify-center mb-6">
              <div className="flex-grow h-px bg-slate-200 dark:bg-gray-800"></div>
              <span className="flex-shrink-0 mx-4 text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-gray-500">or</span>
              <div className="flex-grow h-px bg-slate-200 dark:bg-gray-800"></div>
            </div>

            {/* Traditional Login Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-gray-500 mb-2">Email Address</label>
                {/* 👇 UPDATED: Added autoComplete="username" */}
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  autoComplete="username"
                  placeholder="you@example.com" 
                  className="w-full bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:border-nl-accent focus:ring-1 focus:ring-nl-accent transition-all placeholder-slate-400 dark:placeholder-gray-600" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-gray-500 mb-2">Password</label>
                <div className="relative">
                  {/* 👇 UPDATED: Added autoComplete="current-password" */}
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    autoComplete="current-password"
                    placeholder="••••••••••••" 
                    className="w-full bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl py-3.5 px-4 pr-10 text-sm focus:outline-none focus:border-nl-accent focus:ring-1 focus:ring-nl-accent transition-all placeholder-slate-400 dark:placeholder-gray-600" 
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-nl-accent transition-colors">
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-slate-900 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-white font-bold py-3.5 rounded-xl hover:border-nl-accent/50 transition-all duration-300 flex items-center justify-center gap-2">
                {isSubmitting ? <div className="animate-spin h-5 w-5 border-2 border-nl-accent border-t-transparent rounded-full" /> : <span>Sign In</span>}
              </button>
            </form>

            {/* Toast System */}
            <div className={`mt-4 p-3 rounded-xl border text-xs font-medium text-center transition-all duration-300 ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} ${toast.type === 'success' ? 'bg-nl-success/10 border-nl-success/30 text-nl-success' : toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-nl-accent/10 border-nl-accent/30 text-nl-accent'}`}>
              {toast.message}
            </div>
          </div>
        </div>
      </div>

      {/* Background Decor */}
      <div className="fixed top-20 left-20 w-72 h-72 bg-nl-accent/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-nl-success/10 rounded-full blur-3xl pointer-events-none"></div>
    </div>
  );
}