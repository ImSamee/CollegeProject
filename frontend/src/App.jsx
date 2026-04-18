import React, { useState, useEffect, createContext, useContext, useRef } from 'react'
import { ethers } from 'ethers'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Calendar as CalendarIcon, MessageSquare, Settings,
  Activity, Moon, Brain, ShieldCheck, Bell, Plus, CheckCircle2, XCircle,
  LogOut, Search, ChevronRight, ChevronLeft, Filter, Paperclip,
  Send, User, Lock, FileArchive, Sun, AlertTriangle,
  Copy, Check, Upload, Wallet, Trash2, Edit3, File, ZapOff, Zap,
  Stethoscope, ClipboardList, History, Eye, RefreshCw, Users, ExternalLink
} from 'lucide-react'

// 👇 IMPORT THE LOGIN PAGE
import LoginPage from './LoginPage';

// 🚨 ENVIRONMENT VARIABLES (Set these in frontend/.env)
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || ""; // ⚠️ Set VITE_CONTRACT_ADDRESS in frontend/.env
const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || "http://localhost:8002";

const CONTRACT_ABI = [
  "function hasAccess(bytes32 patientId, address doctor) view returns (bool)",
  "function getPatientNonce(bytes32 patientId) view returns (uint256)",
  "function patients(bytes32) view returns (bytes32 patientId, address controllerAddress, uint40 registeredAt, bool active, uint32 recordCount, bool consentGiven, bytes32 consentHash)",
  "function doctors(address) view returns (bool)",
  "function getPatientRecords(bytes32 patientId, uint256 offset, uint256 limit) view returns (uint256[] memory page, uint256 total)",
  "function getRecord(uint256 recordId) view returns (bytes32 patientId, uint256 timestamp, bytes32 merkleRoot, bytes32 classification, uint16 confidenceBps, bool anomalyFlagged, address submittingDoctor)",
  "function accessGrants(uint256) view returns (bytes32 patientId, address doctorAddress, uint40 grantedAt, uint40 expiresAt, bool active, bytes32 purposeHash)",
  "function totalGrants() view returns (uint256)",
]


const DOCTORS = [
  { name: "Dr. Sarah Lee",    specialty: "Neurology",  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { name: "Dr. Marcus Thorne",specialty: "Surgery",    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { name: "Dr. Elena Vance",  specialty: "Psychiatry", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
  { name: "Dr. John Doe",      specialty: "Medicine",   address: "0xc569398e26d53e1eA6F07f73cc8F786808814d16" },
]
const KNOWN_PATIENT_IDS = [
  { id: "0x" + "02".repeat(32), name: "Alex Sterling", initials: "AS" },
  { id: "0x" + "01".repeat(32), name: "Demo Patient",  initials: "DP" },
]

const formatTime = (t) => {
  const n = parseInt(t, 10)
  if (!isNaN(n) && n > 1_000_000_000)
    return new Date(n * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return t
}
const formatDateLabel = (t) => {
  const n = parseInt(t, 10)
  if (!isNaN(n) && n > 1_000_000_000) {
    const d = new Date(n * 1000), today = new Date(), yest = new Date()
    yest.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yest.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  }
  return ''
}
const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase()
  if (['jpg','jpeg','png','gif','webp','dcm'].includes(ext)) return FileArchive
  if (['pdf'].includes(ext)) return FileText
  return File
}
const shortAddr = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ''
const shortHash = (h) => h ? `${h.slice(0,8)}...${h.slice(-6)}` : ''
const formatTs = (ts) => {
  if (!ts || ts === 0) return '—'
  return new Date(Number(ts) * 1000).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}
const classLabel = (hex) => {
  try { const b = ethers.toUtf8String(hex).replace(/\0/g,''); return b || shortHash(hex) }
  catch { return shortHash(hex) }
}
const getDoctorProfile = (address) =>
  DOCTORS.find(d => d.address.toLowerCase() === address?.toLowerCase()) ||
  { name: shortAddr(address), specialty: 'Physician', address }

// 👇 EXPORTED ThemeContext so LoginPage can access it
export const ThemeContext = createContext()

const getTheme = (isLight) => ({
  bgBase:        isLight ? 'bg-slate-50'  : 'bg-nl-dark',
  bgPanel:       isLight ? 'bg-white shadow-lg shadow-slate-200/50' : 'bg-nl-panel shadow-2xl shadow-black/50',
  bgInput:       isLight ? 'bg-slate-100' : 'bg-gray-900',
  bgHover:       isLight ? 'hover:bg-slate-100' : 'hover:bg-gray-800/30',
  textPrimary:   isLight ? 'text-slate-900' : 'text-white',
  textSecondary: isLight ? 'text-slate-600' : 'text-gray-400',
  textMuted:     isLight ? 'text-slate-400' : 'text-gray-500',
  border:        isLight ? 'border-slate-200' : 'border-gray-800',
  divider:       isLight ? 'divide-slate-100' : 'divide-gray-800/50',
})

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle size={40} className="text-yellow-500" />
        <p className="text-slate-500 text-sm">Something went wrong.</p>
        <button onClick={() => this.setState({ hasError: false })} className="text-xs bg-nl-accent text-white px-4 py-2 rounded-lg">Try again</button>
      </div>
    )
    return this.props.children
  }
}

/* ── PATIENT PORTAL SIDEBAR ── */
const Sidebar = ({ account, disconnectWallet }) => {
  const location = useLocation()
  const { isLight } = useContext(ThemeContext)
  const theme = getTheme(isLight)
  const NavItem = ({ icon: Icon, label, path }) => {
    const active = location.pathname === path
    return (
      <Link to={path} className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${active ? (isLight?'bg-slate-100 text-nl-accent shadow-sm':'bg-nl-panel text-nl-accent shadow-lg') : `${theme.textSecondary} ${theme.bgHover}`}`}>
        <Icon size={20}/><span className="font-medium text-sm">{label}</span>
      </Link>
    )
  }
  return (
    <div className={`w-64 border-r flex flex-col justify-between h-screen sticky top-0 ${theme.bgBase} ${theme.border} transition-colors duration-300`}>
      <div>
        <div className="p-6 flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-nl-accent rounded-full flex items-center justify-center"><ShieldCheck size={20} className={isLight?"text-white":"text-nl-dark"}/></div>
          <div><h1 className={`font-bold text-lg leading-tight ${theme.textPrimary}`}>NeuroLedger</h1><p className="text-[10px] uppercase tracking-widest text-nl-accent font-bold opacity-80">Patient Portal</p></div>
        </div>
        <nav className="px-4 space-y-1">
          <NavItem icon={LayoutDashboard} label="Dashboard"      path="/"/>
          <NavItem icon={FileText}        label="Health Records" path="/records"/>
          <NavItem icon={CalendarIcon}    label="Appointments"   path="/appointments"/>
          <NavItem icon={MessageSquare}   label="Messages"       path="/messages"/>
          <NavItem icon={Settings}        label="Settings"       path="/settings"/>
        </nav>
      </div>
      <div className={`p-4 border-t ${theme.border}`}>
        <div className={`${theme.bgPanel} rounded-xl p-3 border flex items-center gap-3`}>
          <div className="w-9 h-9 bg-gradient-to-tr from-nl-accent to-blue-600 rounded-lg flex-shrink-0"/>
          <div className="overflow-hidden"><p className={`font-bold text-xs truncate ${theme.textPrimary}`}>Alex Sterling</p><p className={`text-[10px] ${theme.textMuted}`}>ID: 882-94</p></div>
        </div>
      </div>
    </div>
  )
}

/* ── PATIENT PORTAL HEADER ── */
const Header = ({ account, connectWallet, disconnectWallet }) => {
  const { isLight, setIsLight } = useContext(ThemeContext)
  const theme = getTheme(isLight)
  const [showGuide, setShowGuide] = useState(false)
  return (
    <header className={`flex justify-between items-center p-8 pb-4 backdrop-blur-md sticky top-0 z-10 transition-colors duration-300 ${isLight?'bg-slate-50/80':'bg-nl-dark/80'}`}>
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} size={18}/>
        <input type="text" placeholder="Search records, labs, or reports..." className={`w-96 ${theme.bgPanel} border ${theme.border} ${theme.textPrimary} rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-nl-accent transition-all`}/>
      </div>
      <div className="flex items-center gap-6">
        <button onClick={()=>setIsLight(!isLight)} className={`p-2 rounded-full ${theme.bgInput} ${theme.textSecondary} hover:text-nl-accent transition-colors`}>{isLight?<Moon size={20}/>:<Sun size={20}/>}</button>
        <Bell size={20} className={`${theme.textMuted} cursor-pointer hover:text-nl-accent transition`}/>
        {!account ? (
          <div className="relative">
            <button onMouseEnter={()=>setShowGuide(true)} onMouseLeave={()=>setShowGuide(false)} onClick={connectWallet} className={`bg-nl-accent hover:bg-sky-400 ${isLight?'text-white':'text-nl-dark'} font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all`}><Plus size={18}/> Connect Wallet</button>
            {showGuide&&(
              <div className={`absolute right-0 top-12 w-72 ${theme.bgPanel} border ${theme.border} rounded-xl p-4 z-50`}>
                <p className={`text-xs font-bold ${theme.textPrimary} mb-1`}>What is a wallet?</p>
                <p className={`text-xs ${theme.textSecondary} leading-relaxed mb-3`}>A Web3 wallet is your digital identity. No gas fees for signing.</p>
                {[['Rabby Wallet','Recommended'],['MetaMask','Most popular']].map(([n,d])=>(
                  <div key={n} className={`flex items-center gap-2 p-2 rounded-lg ${theme.bgInput} mb-1`}><Wallet size={13} className="text-nl-accent flex-shrink-0"/><div><p className={`text-xs font-bold ${theme.textPrimary}`}>{n}</p><p className={`text-[10px] ${theme.textMuted}`}>{d}</p></div></div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={`flex items-center gap-3 ${theme.bgPanel} border ${theme.border} pl-4 pr-1.5 py-1.5 rounded-xl`}>
            <span className="text-nl-accent text-xs font-mono font-bold">{account.slice(0,6)}...{account.slice(-4)}</span>
            <button onClick={disconnectWallet} className={`flex items-center gap-1.5 ${theme.bgInput} hover:bg-red-500/10 ${theme.textSecondary} hover:text-red-500 border border-transparent py-1.5 px-3 rounded-lg transition-all`}><LogOut size={14}/><span className="text-xs font-bold uppercase tracking-wider">Disconnect</span></button>
          </div>
        )}
      </div>
    </header>
  )
}

const Sparkline = ({ data, color }) => {
  const min = Math.min(...data), max = Math.max(...data)
  const norm = data.map(v => max===min?0.5:(v-min)/(max-min))
  const pts = norm.map((v,i)=>`${(i/(norm.length-1))*80},${28-v*(28-4)-2}`).join(' ')
  return <svg width={80} height={28} viewBox="0 0 80 28" className="opacity-70"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

/* ── DASHBOARD ── */
const DashboardPage = ({ account, status, txHash, hasAccess, checkAccess, grantAccessMeta, revokeAccessMeta, patientId, targetDoctor, setTargetDoctor, heartRate, sleepQuality, cognitiveLoad }) => {
  const { isLight } = useContext(ThemeContext)
  const theme = getTheme(isLight)
  const MetricCard = ({ title, value, unit, icon: Icon, trend, colorClass, history, sparkColor }) => (
    <div className={`${theme.bgPanel} p-6 rounded-2xl border ${theme.border} flex flex-col`}>
      <div className="flex justify-between items-start mb-3"><span className={`${theme.textSecondary} text-sm font-semibold uppercase tracking-wider`}>{title}</span><div className={`p-2 rounded-lg ${theme.bgInput} ${colorClass}`}><Icon size={18}/></div></div>
      <div className="flex items-end justify-between mb-1"><div className="flex items-baseline gap-2"><span className={`text-4xl font-bold tracking-tight ${theme.textPrimary}`}>{value}</span><span className={`${theme.textSecondary} font-medium text-sm`}>{unit}</span></div><Sparkline data={history} color={sparkColor}/></div>
      <div className={`text-xs font-bold mt-2 ${trend.startsWith('↗')?'text-nl-success':'text-nl-accent'}`}>{trend}</div>
    </div>
  )
  return (
    <div className={`p-8 pt-4 animate-in fade-in duration-500 ${theme.bgBase}`}>
      <h2 className={`text-3xl font-bold mb-2 tracking-tight ${theme.textPrimary}`}>Welcome back, Alex</h2>
      <p className={`${theme.textSecondary} mb-8 font-medium`}>Your neural synchronization is currently at <span className="text-nl-accent font-bold">98% efficiency</span>.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard title="Heart Rate"    value={heartRate}    unit="BPM" icon={Activity} trend="↘ 2% from average"   colorClass="text-nl-accent"  history={[68,74,71,76,72,70,72]} sparkColor="#0E76A8"/>
        <MetricCard title="Sleep Quality" value={sleepQuality} unit="%"   icon={Moon}     trend="↗ 5% from last week" colorClass="text-indigo-500" history={[82,85,79,88,84,90,88]} sparkColor="#6366f1"/>
        <MetricCard title="Cognitive Load" value={cognitiveLoad} unit="%" icon={Brain}    trend="Balanced State"      colorClass="text-nl-accent"  history={[55,48,60,45,52,38,42]} sparkColor="#0E76A8"/>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h3 className={`text-xl font-bold tracking-tight ${theme.textPrimary}`}>Upcoming Appointments</h3>
          <div className="space-y-4">
            {[{date:'24',title:'Neural Response Scan',dr:'Dr. Sarah Lee',type:'In-Person'},{date:'28',title:'Routine Tele-Sync',dr:'Dr. Marcus Thorne',type:'Virtual'}].map((apt,i)=>(
              <div key={i} className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-5 flex items-center justify-between ${theme.bgHover} transition-colors cursor-pointer`}>
                <div className="flex items-center gap-5">
                  <div className={`${theme.bgInput} rounded-xl p-3 text-center min-w-[65px] border ${theme.border}`}><p className={`text-[10px] ${theme.textMuted} font-black uppercase`}>OCT</p><p className={`text-xl font-black ${theme.textPrimary}`}>{apt.date}</p></div>
                  <div><h4 className={`font-bold text-base mb-1 ${theme.textPrimary}`}>{apt.title}</h4><p className={`text-sm ${theme.textSecondary} font-medium`}>{apt.dr}</p></div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${apt.type==='Virtual'?'border-nl-accent/30 text-nl-accent bg-nl-accent/5':`${theme.border} ${theme.textSecondary} ${theme.bgInput}`}`}>{apt.type}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className={`text-xl font-bold mb-6 tracking-tight ${theme.textPrimary}`}>Data Access Control</h3>
          <div className={`${theme.bgPanel} border ${theme.border} rounded-[2rem] p-8 flex flex-col`}>
            <div className="mb-5">
              <label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Patient Identity</label>
              <div className={`w-full ${theme.bgInput} p-3 rounded-xl border ${theme.border} flex items-center justify-between`}>
                <div><p className={`text-sm font-bold ${theme.textPrimary}`}>Alex Sterling</p><p className={`text-[10px] font-mono mt-0.5 ${theme.textMuted}`}>{patientId.slice(0,10)}...</p></div>
                <div className="bg-nl-accent/10 border border-nl-accent/20 text-nl-accent px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">Primary</div>
              </div>
            </div>
            <div className="mb-5">
              <label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Target Physician</label>
              <div className={`relative w-full ${theme.bgInput} rounded-xl border ${theme.border} focus-within:border-nl-accent transition-colors`}>
                <select value={targetDoctor} onChange={e=>setTargetDoctor(e.target.value)} className={`w-full bg-transparent p-3 text-sm font-bold ${theme.textPrimary} focus:outline-none appearance-none cursor-pointer`}>
                  {DOCTORS.map(d=><option key={d.address} value={d.address} className="bg-slate-800 text-white">{d.name} ({d.specialty})</option>)}
                </select>
                <ChevronRight className={`absolute right-3 top-1/2 -translate-y-1/2 ${theme.textMuted} rotate-90 pointer-events-none`} size={16}/>
              </div>
            </div>
            <div className="mb-6">
              <div className={`rounded-xl border p-3 ${hasAccess?'border-nl-success/30 bg-nl-success/5':`${theme.border} ${theme.bgInput}`}`}>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasAccess?'bg-nl-success/20 text-nl-success':`${theme.bgInput} ${theme.textMuted}`}`}>{hasAccess?<CheckCircle2 size={18}/>:<ShieldCheck size={18}/>}</div>
                  <p className={`font-black text-sm uppercase tracking-tight ${hasAccess?'text-nl-success':theme.textPrimary}`}>{hasAccess?"Access Granted":"Access Pending"}</p>
                </div>
                <p className={`text-[11px] ${theme.textSecondary} ml-11`}>{hasAccess?"Doctor can view records for 24 hrs. Revoke below.":"Sign below — confirms in ~15 seconds on-chain."}</p>
              </div>

              {/* SEPOLIA CLICKABLE HASH WIDGET */}
              {txHash && (
                <div className="mt-3 p-4 bg-nl-accent/10 border border-nl-accent/30 rounded-xl flex flex-col gap-1.5 animate-in zoom-in">
                  <p className="text-[10px] font-black text-nl-accent uppercase tracking-wider">Transaction Confirmed</p>
                  <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" className={`text-xs font-mono font-bold ${theme.textPrimary} hover:text-nl-accent hover:underline flex items-center gap-1 w-fit`}>
                    {txHash.slice(0, 12)}...{txHash.slice(-10)} <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {status && !txHash && <div className="text-[10px] text-nl-accent/90 font-mono bg-nl-accent/5 p-3 rounded-lg border border-nl-accent/20 mt-3 leading-relaxed break-words">{status}</div>}
            </div>
            <div className="space-y-2">
              <button onClick={grantAccessMeta} className={`w-full bg-nl-success hover:bg-emerald-400 ${isLight?'text-white':'text-nl-dark'} font-black py-3.5 rounded-2xl transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2`}><Zap size={15}/> Sign Gasless Meta-Tx</button>
              <button onClick={revokeAccessMeta} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold py-3 rounded-2xl transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2"><XCircle size={14}/> Revoke Access</button>
              <button onClick={checkAccess} className={`w-full ${theme.bgInput} hover:opacity-80 ${theme.textPrimary} font-bold py-2.5 rounded-xl transition-all text-xs uppercase tracking-wider border ${theme.border}`}>Verify On-Chain State</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── HEALTH RECORDS ── */
const HealthRecordsPage = () => {
  const { isLight } = useContext(ThemeContext)
  const theme = getTheme(isLight)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dbRecords, setDbRecords] = useState([])
  const [copiedCid, setCopiedCid] = useState(null)
  const syntheticRecords = [
    { id:'s1', filename:'fMRI_Brain_Scan_Oct.dcm',   ipfs_cid:'QmYwAPJzv5CZsnA625s3Xf2Smup8VvA', size:'4.2 MB' },
    { id:'s2', filename:'Neuro_Serotonin_Panel.pdf', ipfs_cid:'QmQzcqe18qC9B7Z2rX1L',            size:'1.1 MB' },
  ]
  const fetchRecords = async () => { try { const r=await fetch(`${RELAYER_URL}/records`);const d=await r.json();if(d.records)setDbRecords(d.records.reverse()) } catch {} }
  useEffect(()=>{ fetchRecords() },[])
  const handleUpload = async () => {
    if(!selectedFile) return
    setUploadStatus('uploading');setUploadProgress(0);setUploadMsg('Encrypting and uploading...')
    const iv=setInterval(()=>setUploadProgress(p=>Math.min(p+12,85)),300)
    const fd=new FormData();fd.append('file',selectedFile)
    try {
      const r=await fetch(`${RELAYER_URL}/records/upload`,{method:'POST',body:fd});const d=await r.json()
      clearInterval(iv);setUploadProgress(100)
      if(d.status==='success'){setUploadStatus('success');setUploadMsg('File pinned to IPFS.');setSelectedFile(null);setTimeout(fetchRecords,400)}
      else{setUploadStatus('error');setUploadMsg(`Failed: ${d.message}`)}
    } catch{clearInterval(iv);setUploadStatus('error');setUploadMsg('Cannot connect to backend.')}
    setTimeout(()=>{setUploadStatus('idle');setUploadProgress(0)},3500)
  }
  const copyCid=(cid)=>{navigator.clipboard.writeText(cid);setCopiedCid(cid);setTimeout(()=>setCopiedCid(null),1800)}
  const allRecords=[...dbRecords,...syntheticRecords]
  return (
    <div className={`p-8 pt-4 ${theme.bgBase} min-h-full`}>
      <h2 className={`text-3xl font-bold mb-2 ${theme.textPrimary}`}>Health Records</h2>
      <p className={`${theme.textSecondary} mb-8`}>Your neurological medical history, secured on IPFS.</p>
      <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-6 mb-8`}>
        <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${theme.textPrimary}`}><Upload size={20} className="text-nl-accent"/> Upload New Record</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <label className={`cursor-pointer flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl border ${theme.border} ${theme.bgInput} ${theme.textPrimary} hover:border-nl-accent transition-colors`}>
            <Paperclip size={15} className="text-nl-accent"/>{selectedFile?selectedFile.name:'Choose file'}
            <input type="file" className="hidden" onChange={e=>{setSelectedFile(e.target.files[0]);setUploadStatus('idle')}}/>
          </label>
          <button onClick={handleUpload} disabled={!selectedFile||uploadStatus==='uploading'} className={`font-bold py-2.5 px-6 rounded-xl transition-all flex items-center gap-2 ${!selectedFile||uploadStatus==='uploading'?`${theme.bgInput} ${theme.textMuted} cursor-not-allowed`:'bg-nl-accent hover:bg-sky-400 text-white'}`}>
            {uploadStatus==='uploading'?<><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Uploading...</>:'Secure on IPFS'}
          </button>
        </div>
        {uploadStatus==='uploading'&&<div className="mt-4"><div className={`h-1.5 w-full rounded-full ${theme.bgInput} overflow-hidden`}><div className="h-full bg-nl-accent rounded-full transition-all duration-300" style={{width:`${uploadProgress}%`}}/></div></div>}
        {uploadMsg&&uploadStatus!=='uploading'&&<p className={`mt-3 text-sm font-medium ${uploadStatus==='success'?'text-nl-success':'text-red-500'}`}>{uploadMsg}</p>}
      </div>
      <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-6`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className={`font-bold text-lg ${theme.textPrimary}`}>Decentralized File Registry <span className={`text-sm font-normal ${theme.textMuted}`}>({allRecords.length} files)</span></h3>
          <button className={`flex items-center gap-2 text-sm ${theme.textSecondary} hover:text-nl-accent`}><Filter size={16}/> Filter</button>
        </div>
        {allRecords.length===0?(
          <div className="flex flex-col items-center justify-center py-16 gap-4"><div className={`w-16 h-16 rounded-2xl ${theme.bgInput} flex items-center justify-center`}><FileArchive size={32} className={theme.textMuted}/></div><p className={`font-bold ${theme.textPrimary}`}>No records yet</p></div>
        ):(
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={`text-xs ${theme.textMuted} uppercase tracking-wider border-b ${theme.border}`}>
                <tr><th className="pb-3 font-medium">File Name</th><th className="pb-3 font-medium">IPFS Hash (CID)</th><th className="pb-3 font-medium">Size</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Action</th></tr>
              </thead>
              <tbody className={theme.divider}>
                {allRecords.map(row=>{
                  const Icon=getFileIcon(row.filename)
                  return(
                    <tr key={row.id} className={`${theme.bgHover} transition-colors`}>
                      <td className={`py-4 font-bold ${theme.textPrimary}`}><div className="flex items-center gap-2"><Icon size={16} className="text-nl-accent flex-shrink-0"/><span className="truncate max-w-[180px]">{row.filename}</span></div></td>
                      <td className="py-4"><button onClick={()=>copyCid(row.ipfs_cid)} className={`flex items-center gap-1.5 font-mono text-xs ${theme.textMuted} hover:text-nl-accent transition-colors group`} title="Click to copy"><span className="truncate max-w-[160px]">{row.ipfs_cid}</span>{copiedCid===row.ipfs_cid?<Check size={12} className="text-nl-success flex-shrink-0"/>:<Copy size={12} className="opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"/>}</button></td>
                      <td className={`py-4 text-xs ${theme.textMuted}`}>{row.size||'—'}</td>
                      <td className="py-4"><span className="font-bold text-nl-success bg-nl-success/10 px-2 py-1 rounded-md text-xs">Secured on IPFS</span></td>
                      <td className="py-4"><a href={`https://gateway.pinata.cloud/ipfs/${row.ipfs_cid}`} target="_blank" rel="noreferrer" className="text-nl-accent hover:underline flex items-center gap-1 text-xs font-bold">View File <ChevronRight size={14}/></a></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── APPOINTMENTS ── */
const APPOINTMENTS_KEY="neuroledger_appointments"
const defaultApts=[
  {id:1,date:24,month:10,year:2026,title:'Neural Response Scan',dr:'Dr. Sarah Lee (Neurology)',time:'10:00 AM',type:'IN-PERSON'},
  {id:2,date:28,month:10,year:2026,title:'Routine Tele-Sync',dr:'Dr. Marcus Thorne (Surgery)',time:'02:30 PM',type:'VIRTUAL'},
]
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const AppointmentsPage=()=>{
  const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  const[apts,setApts]=useState(()=>{try{const s=localStorage.getItem(APPOINTMENTS_KEY);return s?JSON.parse(s):defaultApts}catch{return defaultApts}})
  useEffect(()=>{localStorage.setItem(APPOINTMENTS_KEY,JSON.stringify(apts))},[apts])
  const today=new Date()
  const[calYear,setCalYear]=useState(today.getFullYear())
  const[calMonth,setCalMonth]=useState(today.getMonth()+1)
  const[filterDate,setFilterDate]=useState(null)
  const[isModalOpen,setIsModalOpen]=useState(false)
  const[editApt,setEditApt]=useState(null)
  const[formData,setFormData]=useState({dr:`${DOCTORS[0].name} (${DOCTORS[0].specialty})`,date:'',time:'09:00',type:'VIRTUAL',title:'Clinical Follow-up'})
  const firstDay=new Date(calYear,calMonth-1,1).getDay()
  const daysInMonth=new Date(calYear,calMonth,0).getDate()
  const aptDates=new Set(apts.filter(a=>a.month===calMonth&&a.year===calYear).map(a=>a.date))
  const prevM=()=>{if(calMonth===1){setCalMonth(12);setCalYear(y=>y-1)}else setCalMonth(m=>m-1);setFilterDate(null)}
  const nextM=()=>{if(calMonth===12){setCalMonth(1);setCalYear(y=>y+1)}else setCalMonth(m=>m+1);setFilterDate(null)}
  const openNew=()=>{setEditApt(null);setFormData({dr:`${DOCTORS[0].name} (${DOCTORS[0].specialty})`,date:'',time:'09:00',type:'VIRTUAL',title:'Clinical Follow-up'});setIsModalOpen(true)}
  const openEdit=(apt)=>{setEditApt(apt);setFormData({dr:apt.dr,date:`${apt.year}-${String(apt.month).padStart(2,'0')}-${String(apt.date).padStart(2,'0')}`,time:'09:00',type:apt.type,title:apt.title});setIsModalOpen(true)}
  const handleSave=()=>{
    if(!formData.date)return alert('Please select a date.')
    const d=new Date(formData.date);let h=parseInt(formData.time.split(':')[0]);const min=formData.time.split(':')[1];const ampm=h>=12?'PM':'AM';h=h%12||12
    const na={id:editApt?editApt.id:Date.now(),date:d.getDate(),month:d.getMonth()+1,year:d.getFullYear(),title:formData.title,dr:formData.dr,time:`${h}:${min} ${ampm}`,type:formData.type}
    setApts(editApt?apts.map(a=>a.id===editApt.id?na:a):[na,...apts]);setIsModalOpen(false)
  }
  const deleteApt=(id)=>setApts(apts.filter(a=>a.id!==id))
  const visibleApts=(filterDate?apts.filter(a=>a.date===filterDate&&a.month===calMonth&&a.year===calYear):[...apts]).sort((a,b)=>new Date(a.year,a.month-1,a.date)-new Date(b.year,b.month-1,b.date))
  return(
    <div className={`p-8 pt-4 ${theme.bgBase} min-h-full`}>
      <div className="flex justify-between items-center mb-8"><h2 className={`text-3xl font-bold ${theme.textPrimary}`}>Appointments</h2><button onClick={openNew} className={`bg-nl-accent ${isLight?'text-white':'text-nl-dark'} font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 hover:bg-sky-400`}><Plus size={18}/> Book New</button></div>
      {isModalOpen&&(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div className={`${theme.bgPanel} rounded-2xl p-8 w-full border ${theme.border}`} style={{maxWidth:440}}>
          <h3 className={`font-bold text-lg mb-6 ${theme.textPrimary}`}>{editApt?'Edit':'Book'} Appointment</h3>
          <div className="space-y-4">
            <div><label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Title</label><input type="text" value={formData.title} onChange={e=>setFormData({...formData,title:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 text-sm focus:outline-none focus:border-nl-accent`}/></div>
            <div><label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Doctor</label><select value={formData.dr} onChange={e=>setFormData({...formData,dr:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 text-sm focus:outline-none focus:border-nl-accent`}>{DOCTORS.map(d=><option key={d.address} value={`${d.name} (${d.specialty})`}>{d.name} ({d.specialty})</option>)}</select></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Date</label><input type="date" value={formData.date} onChange={e=>setFormData({...formData,date:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 text-sm focus:outline-none focus:border-nl-accent`}/></div>
              <div><label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Time</label><input type="time" value={formData.time} onChange={e=>setFormData({...formData,time:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 text-sm focus:outline-none focus:border-nl-accent`}/></div>
            </div>
            <div><label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Type</label><select value={formData.type} onChange={e=>setFormData({...formData,type:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 text-sm focus:outline-none focus:border-nl-accent`}><option value="VIRTUAL">Virtual</option><option value="IN-PERSON">In-Person</option></select></div>
          </div>
          <div className="flex gap-3 mt-6"><button onClick={handleSave} className="flex-1 bg-nl-accent text-white font-bold py-3 rounded-xl hover:bg-sky-400">{editApt?'Save':'Confirm'}</button><button onClick={()=>setIsModalOpen(false)} className={`flex-1 ${theme.bgInput} ${theme.textPrimary} font-bold py-3 rounded-xl border ${theme.border}`}>Cancel</button></div>
        </div>
      </div>)}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-4">
          <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-6`}>
            <div className="flex items-center justify-between mb-4"><button onClick={prevM} className={`p-1.5 rounded-lg ${theme.bgInput} ${theme.textSecondary} hover:text-nl-accent`}><ChevronLeft size={16}/></button><h3 className={`font-bold text-base ${theme.textPrimary}`}>{MONTH_NAMES[calMonth-1]} {calYear}</h3><button onClick={nextM} className={`p-1.5 rounded-lg ${theme.bgInput} ${theme.textSecondary} hover:text-nl-accent`}><ChevronRight size={16}/></button></div>
            <div className={`grid grid-cols-7 gap-1 text-xs ${theme.textMuted} mb-2 font-bold text-center`}>{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1 text-sm font-medium text-center">
              {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`}/>)}
              {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                const isToday=day===today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear()
                const hasApt=aptDates.has(day),selected=filterDate===day
                return(<div key={day} onClick={()=>setFilterDate(selected?null:day)} className={`relative p-1.5 rounded-lg cursor-pointer transition-all ${selected?`bg-nl-accent ${isLight?'text-white':'text-nl-dark'} font-bold`:isToday?`border border-nl-accent/50 text-nl-accent`:`${theme.bgHover} ${theme.textPrimary}`}`}>{day}{hasApt&&!selected&&<span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-nl-accent block"/>}</div>)
              })}
            </div>
          </div>
          {filterDate&&<div className={`${theme.bgInput} border border-nl-accent/30 rounded-xl p-3 text-xs text-nl-accent font-medium flex items-center justify-between`}><span>Showing {MONTH_SHORT[calMonth-1]} {filterDate}</span><button onClick={()=>setFilterDate(null)}>✕ Clear</button></div>}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <h3 className={`text-xl font-bold flex items-center gap-2 ${theme.textPrimary}`}><CalendarIcon size={20}/>{filterDate?`${MONTH_SHORT[calMonth-1]} ${filterDate}`:'Upcoming'}<span className={`text-sm font-normal ${theme.textMuted}`}>({visibleApts.length})</span></h3>
          {visibleApts.length===0?(<div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-10 text-center`}><CalendarIcon size={32} className={`${theme.textMuted} mx-auto mb-3`}/><p className={`${theme.textSecondary} text-sm`}>No appointments{filterDate?' on this day':''}.</p></div>)
          :visibleApts.map(apt=>(
            <div key={apt.id} className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-5 flex items-center justify-between gap-4 ${theme.bgHover} transition-colors group`}>
              <div className="flex items-center gap-5">
                <div className={`${theme.bgInput} rounded-xl p-3 text-center border ${theme.border} min-w-[70px]`}><p className={`text-[10px] ${theme.textMuted} font-black uppercase`}>{MONTH_SHORT[apt.month-1]}</p><p className={`text-xl font-black ${theme.textPrimary}`}>{String(apt.date).padStart(2,'0')}</p></div>
                <div><h4 className={`font-bold text-base mb-1 ${theme.textPrimary}`}>{apt.title}</h4><p className={`text-sm ${theme.textSecondary} font-medium`}>👨‍⚕️ {apt.dr} &nbsp;🕒 {apt.time}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg ${apt.type==='VIRTUAL'?'bg-nl-accent/10 text-nl-accent border border-nl-accent/20':`${theme.bgInput} border ${theme.border} ${theme.textSecondary}`}`}>{apt.type}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={()=>openEdit(apt)} className={`p-1.5 rounded-lg ${theme.bgInput} ${theme.textSecondary} hover:text-nl-accent`}><Edit3 size={14}/></button>
                  <button onClick={()=>deleteApt(apt.id)} className={`p-1.5 rounded-lg ${theme.bgInput} ${theme.textSecondary} hover:text-red-500`}><Trash2 size={14}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── MESSAGES (UPDATED: Chat isolation per doctor) ── */
const MessagesPage=({heartRate,sleepQuality,cognitiveLoad})=>{
  const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight);const bottomRef=useRef(null)
  const[input,setInput]=useState("");const[messages,setMessages]=useState([]);const[isLoading,setIsLoading]=useState(true)
  const[isSystemOnline,setSystemOnline]=useState(false);const[selectedDoctor,setSelectedDoctor]=useState(DOCTORS[0]);const[isSending,setIsSending]=useState(false)
  
  useEffect(()=>{const check=async()=>{try{const r=await fetch(`${RELAYER_URL}/health`);if(r.ok){const d=await r.json();setSystemOnline(d.status==="ok"&&d.provider_connected)}else setSystemOnline(false)}catch{setSystemOnline(false)}};check();const id=setInterval(check,5000);return()=>clearInterval(id)},[])
  
  // Re-fetch messages EVERY TIME the doctor dropdown changes!
  useEffect(()=>{
    setIsLoading(true);
    // Passing the doctor's address so the backend can filter the history
    fetch(`${RELAYER_URL}/chat/messages?doctor_address=${selectedDoctor.address}`)
      .then(r=>r.json())
      .then(d=>{
        // Dynamic greeting tailored to the selected doctor
        const defaultMsg = {id:0,text:`Hello Alex. I am ${selectedDoctor.name}'s AI Assistant. Your file is secure. How can I help you today?`,time:String(Math.floor(Date.now()/1000)),isDoc:true};
        setMessages(d.messages?.length ? d.messages : [defaultMsg])
      })
      .catch(()=>setMessages([{id:0,text:`Hello Alex. I am ${selectedDoctor.name}'s AI Assistant.`,time:String(Math.floor(Date.now()/1000)),isDoc:true}]))
      .finally(()=>setIsLoading(false))
  }, [selectedDoctor.address, selectedDoctor.name])
  
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages])
  
  const handleSend=async()=>{
    if(!input.trim()||isSending)return;const text=input;setInput("");setIsSending(true)
    setMessages(prev=>[...prev,{id:Date.now(),text,time:String(Math.floor(Date.now()/1000)),isDoc:false}])
    try{
      // Send the doctor_address so the backend knows who to save the message to
      const r=await fetch(`${RELAYER_URL}/chat/send`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          text,
          is_doctor:false,
          doctor_name:`${selectedDoctor.name} (${selectedDoctor.specialty})`,
          doctor_address: selectedDoctor.address, 
          vitals:{heartRate,sleepQuality,cognitiveLoad}
        })
      });
      const d=await r.json();
      setMessages(d.messages)
    }catch{}
    setIsSending(false)
  }
  
  const grouped=messages.reduce((acc,msg,i)=>{const label=formatDateLabel(msg.time),prev=i>0?formatDateLabel(messages[i-1].time):null;if(label&&label!==prev)acc.push({type:'separator',label,key:`s${i}`});acc.push({type:'message',msg});return acc},[])
  
  return(
    <div className={`flex h-full border-t ${theme.border} ${theme.bgBase}`}>
      <div className={`w-80 border-r ${theme.border} flex-col ${theme.bgPanel} hidden md:flex`}>
        <div className={`p-6 border-b ${theme.border}`}>
          <h3 className={`text-xl font-bold mb-4 ${theme.textPrimary}`}>Inbox</h3>
          <div className="mb-4">
            <label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-2 block`}>Consulting Doctor</label>
            <select value={selectedDoctor.address} onChange={e=>setSelectedDoctor(DOCTORS.find(d=>d.address===e.target.value))} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 text-sm focus:outline-none focus:border-nl-accent mb-3`}>{DOCTORS.map(d=><option key={d.address} value={d.address}>{d.name} — {d.specialty}</option>)}</select>
            <div className={`${theme.bgInput} rounded-xl p-3 border ${theme.border}`}>
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-nl-accent/20 flex items-center justify-center text-nl-accent font-bold text-sm">{selectedDoctor.name.split(' ').slice(1).map(n=>n[0]).join('')}</div><div><p className={`text-xs font-bold ${theme.textPrimary}`}>{selectedDoctor.name}</p><p className={`text-[10px] ${theme.textMuted}`}>{selectedDoctor.specialty} Specialist</p></div></div>
              <p className={`mt-2 pt-2 border-t ${theme.border} text-[10px] ${theme.textMuted}`}>AI persona active</p>
            </div>
          </div>
          <input type="text" placeholder="Search conversations..." className={`w-full ${theme.bgInput} border ${theme.border} ${theme.textPrimary} rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-nl-accent`}/>
        </div>
        <div className="flex-1 overflow-y-auto"><div className={`p-4 border-l-4 border-nl-accent ${theme.bgInput} cursor-pointer`}><div className="flex justify-between items-start mb-1"><span className={`font-bold text-sm ${theme.textPrimary}`}>{selectedDoctor.name} (AI)</span><span className={`text-[10px] font-bold ${isSystemOnline?'text-nl-success':'text-red-400'}`}>{isSystemOnline?"Online":"Offline"}</span></div><p className="text-xs text-nl-accent truncate">Active conversation</p></div></div>
      </div>
      <div className="flex-1 flex flex-col relative">
        <div className={`p-5 border-b ${theme.border} flex items-center gap-4 ${theme.bgPanel} sticky top-0 z-10`}>
          <div className={`w-10 h-10 ${theme.bgInput} rounded-full border-2 flex items-center justify-center ${isSystemOnline?'border-nl-success text-nl-success':'border-red-500/50 text-red-500/80'}`}><Brain size={20}/></div>
          <div><p className={`font-bold text-sm ${theme.textPrimary}`}>{selectedDoctor.name}'s AI Assistant</p><p className={`text-xs font-medium flex items-center gap-1.5 mt-0.5 ${isSystemOnline?'text-nl-success':'text-red-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${isSystemOnline?'bg-nl-success animate-pulse':'bg-red-500'}`}/>{isSystemOnline?`Online · ${selectedDoctor.specialty} mode`:"Offline · Waiting for Backend..."}</p></div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-4">
          {isLoading?(<div className="space-y-4 animate-pulse">{[1,2,3].map(i=><div key={i} className={`flex ${i%2===0?'justify-end':'justify-start'}`}><div className={`h-12 rounded-2xl ${theme.bgInput} ${i%2===0?'w-48':'w-64'}`}/></div>)}</div>)
          :messages.length===0&&!isSystemOnline?(<div className="flex flex-col items-center justify-center h-full gap-4 py-20"><div className={`w-16 h-16 rounded-2xl ${theme.bgInput} flex items-center justify-center`}><ZapOff size={28} className="text-red-400"/></div><p className={`font-bold ${theme.textPrimary}`}>Backend Offline</p><p className={`text-sm ${theme.textSecondary} text-center max-w-xs`}>Start with <code className="text-xs font-mono bg-red-500/10 px-1.5 py-0.5 rounded text-red-500">uvicorn main:app --reload</code></p></div>)
          :grouped.map(item=>item.type==='separator'?(<div key={item.key} className="flex items-center gap-3 py-2"><div className={`flex-1 h-px ${theme.border} border-t`}/><span className={`text-[10px] font-bold uppercase tracking-wider ${theme.textMuted}`}>{item.label}</span><div className={`flex-1 h-px ${theme.border} border-t`}/></div>)
          :(<div key={item.msg.id} className={`flex ${item.msg.isDoc?'justify-start':'justify-end'}`}><div className={`max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed ${item.msg.isDoc?`${theme.bgPanel} ${theme.textPrimary} border ${theme.border} rounded-tl-sm`:`bg-nl-accent ${isLight?'text-white':'text-nl-dark'} font-medium rounded-tr-sm`}`}>{item.msg.text}<p className={`text-[10px] mt-2 font-medium ${item.msg.isDoc?theme.textMuted:'opacity-60'}`}>{formatTime(item.msg.time)}</p></div></div>)
          )}
          {isSending&&<div className="flex justify-start"><div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${theme.bgPanel} border ${theme.border} flex items-center gap-1`}>{[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full bg-nl-accent animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div></div>}
          <div ref={bottomRef}/>
        </div>
        <div className={`p-6 border-t ${theme.border} ${theme.bgPanel}`}>
          <div className={`${theme.bgInput} rounded-xl p-2 flex items-center gap-2 border ${theme.border} focus-within:border-nl-accent transition-colors ${!isSystemOnline?'opacity-50 pointer-events-none':''}`}>
            <input disabled={!isSystemOnline||isSending} value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleSend()} type="text" placeholder={isSystemOnline?`Message ${selectedDoctor.name}...`:"Cannot send messages while offline..."} className={`flex-1 bg-transparent border-none focus:outline-none text-sm px-4 ${theme.textPrimary}`}/>
            <button disabled={!isSystemOnline||isSending||!input.trim()} onClick={handleSend} className={`p-2.5 rounded-lg transition-all ${input.trim()&&isSystemOnline?`bg-nl-accent ${isLight?'text-white':'text-nl-dark'} hover:bg-sky-400`:`${theme.bgInput} ${theme.textMuted} cursor-not-allowed`}`}><Send size={18}/></button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── SETTINGS ── */
const SettingsPage=({account,disconnectWallet})=>{
  const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  const[profile,setProfile]=useState(()=>{try{return JSON.parse(localStorage.getItem('nl_profile'))||{name:'Alex Sterling',dob:'04/12/1988'}}catch{return{name:'Alex Sterling',dob:'04/12/1988'}}})
  const[profileSaved,setProfileSaved]=useState(false)
  const saveProfile=()=>{localStorage.setItem('nl_profile',JSON.stringify(profile));setProfileSaved(true);setTimeout(()=>setProfileSaved(false),2000)}
  const[strictSig,setStrictSig]=useState(()=>JSON.parse(localStorage.getItem('nl_strictSig')??'true'))
  const[cryptoShred,setCryptoShred]=useState(()=>JSON.parse(localStorage.getItem('nl_cryptoShred')??'true'))
  useEffect(()=>{localStorage.setItem('nl_strictSig',JSON.stringify(strictSig))},[strictSig])
  useEffect(()=>{localStorage.setItem('nl_cryptoShred',JSON.stringify(cryptoShred))},[cryptoShred])
  const Toggle=({value,onChange,label,desc})=>(<div className={`flex items-center justify-between p-4 ${theme.bgInput} rounded-xl border ${theme.border}`}><div><p className={`font-bold text-sm ${theme.textPrimary}`}>{label}</p><p className={`text-xs ${theme.textMuted} mt-1`}>{desc}</p></div><div onClick={()=>onChange(!value)} className={`w-12 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${value?'bg-nl-success':'bg-gray-400'}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${value?'translate-x-6':''}`}/></div></div>)
  return(
    <div className={`p-8 pt-4 max-w-4xl min-h-full ${theme.bgBase}`}>
      <h2 className={`text-3xl font-bold mb-8 ${theme.textPrimary}`}>Portal Settings</h2>
      <div className="space-y-6">
        <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-6`}>
          <h3 className={`font-bold text-lg mb-6 flex items-center gap-2 border-b ${theme.border} pb-4 ${theme.textPrimary}`}><User size={20} className="text-nl-accent"/> Patient Profile</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div><label className={`text-[10px] ${theme.textMuted} uppercase tracking-widest font-bold`}>Full Name</label><input type="text" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 mt-2 text-sm focus:border-nl-accent focus:outline-none`}/></div>
            <div><label className={`text-[10px] ${theme.textMuted} uppercase tracking-widest font-bold`}>Date of Birth</label><input type="text" value={profile.dob} onChange={e=>setProfile({...profile,dob:e.target.value})} className={`w-full ${theme.bgInput} ${theme.textPrimary} border ${theme.border} rounded-xl p-3 mt-2 text-sm focus:border-nl-accent focus:outline-none`}/></div>
            <div className="md:col-span-2"><label className={`text-[10px] ${theme.textMuted} uppercase tracking-widest font-bold`}>Sync ID (Immutable)</label><input type="text" defaultValue="882-94-ALX-2026" disabled className={`w-full bg-transparent border ${theme.border} rounded-xl p-3 mt-2 text-sm ${theme.textMuted} font-mono cursor-not-allowed`}/></div>
          </div>
          <button onClick={saveProfile} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${profileSaved?'bg-nl-success text-white':'bg-nl-accent hover:bg-sky-400 text-white'}`}>{profileSaved?<><Check size={15}/> Saved</>:'Save Profile'}</button>
        </div>
        <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-6`}>
          <h3 className={`font-bold text-lg mb-6 flex items-center gap-2 border-b ${theme.border} pb-4 ${theme.textPrimary}`}><Lock size={20} className="text-nl-accent"/> Security & Web3 Privacy</h3>
          <div className="space-y-4"><Toggle value={strictSig} onChange={setStrictSig} label="Strict MetaMask Signature Requirement" desc="Require wallet signature to decrypt old records from IPFS."/><Toggle value={cryptoShred} onChange={setCryptoShred} label="Crypto-Shredding (GDPR Art. 17)" desc="Automatically purge local AES keys when access is revoked on-chain."/></div>
        </div>
        <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-6`}>
          <h3 className={`font-bold text-lg mb-6 flex items-center gap-2 border-b ${theme.border} pb-4 ${theme.textPrimary}`}><Wallet size={20} className="text-nl-accent"/> Connected Wallet</h3>
          {account?(<div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className={`${theme.bgInput} rounded-xl p-4 border ${theme.border}`}><p className={`text-[10px] ${theme.textMuted} uppercase tracking-widest font-bold mb-1`}>Address</p><p className={`text-sm font-mono font-bold ${theme.textPrimary} truncate`}>{account}</p></div><div className={`${theme.bgInput} rounded-xl p-4 border ${theme.border}`}><p className={`text-[10px] ${theme.textMuted} uppercase tracking-widest font-bold mb-1`}>Network</p><p className="text-sm font-bold text-nl-success">Sepolia Testnet</p></div></div><div className={`flex items-center gap-2 p-3 rounded-xl ${theme.bgInput} border border-nl-success/20`}><div className="w-2 h-2 rounded-full bg-nl-success animate-pulse"/><p className={`text-xs font-medium ${theme.textSecondary}`}>Wallet connected and verified</p></div><button onClick={disconnectWallet} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all"><LogOut size={15}/> Disconnect Wallet</button></div>)
          :(<div className="flex flex-col items-center py-8 gap-3"><Wallet size={32} className={theme.textMuted}/><p className={`text-sm ${theme.textSecondary}`}>No wallet connected.</p></div>)}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   DOCTOR PORTAL COMPONENTS
════════════════════════════════════════════════════════════════════════════ */

const DoctorSidebar=({account,disconnectWallet,doctorProfile})=>{
  const location=useLocation();const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  const NavItem=({icon:Icon,label,path})=>{
    const active=location.pathname===path
    return(<Link to={path} className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${active?(isLight?'bg-emerald-50 text-emerald-700 shadow-sm':'bg-nl-panel text-nl-success shadow-lg'):`${theme.textSecondary} ${theme.bgHover}`}`}><Icon size={20}/><span className="font-medium text-sm">{label}</span></Link>)
  }
  const initials=doctorProfile.name.split(' ').filter(w=>w.length>1).slice(-2).map(w=>w[0]).join('')
  return(
    <div className={`w-64 border-r flex flex-col justify-between h-screen sticky top-0 ${theme.bgBase} ${theme.border} transition-colors duration-300`}>
      <div>
        <div className="p-6 flex items-center gap-3 mb-2"><div className="w-8 h-8 bg-nl-success rounded-full flex items-center justify-center"><Stethoscope size={18} className="text-white"/></div><div><h1 className={`font-bold text-lg leading-tight ${theme.textPrimary}`}>NeuroLedger</h1><p className="text-[10px] uppercase tracking-widest text-nl-success font-bold opacity-80">Doctor Portal</p></div></div>
        <div className="mx-4 mb-4"><span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>Verified Physician</span></div>
        <nav className="px-4 space-y-1">
          <NavItem icon={Users}         label="My Patients"   path="/doctor/patients"/>
          <NavItem icon={ClipboardList} label="Record Viewer" path="/doctor/records"/>
          <NavItem icon={History}       label="Access Log"    path="/doctor/access"/>
        </nav>
      </div>
      <div className={`p-4 border-t ${theme.border}`}>
        <div className={`${theme.bgPanel} rounded-xl p-3 border flex items-center gap-3`}>
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs flex-shrink-0">{initials||'DR'}</div>
          <div className="overflow-hidden flex-1"><p className={`font-bold text-xs truncate ${theme.textPrimary}`}>{doctorProfile.name}</p><p className="text-[10px] text-nl-success">{doctorProfile.specialty}</p></div>
          <button onClick={disconnectWallet} title="Disconnect" className={`p-1.5 rounded-lg ${theme.bgInput} ${theme.textSecondary} hover:text-red-500 transition-colors`}><LogOut size={14}/></button>
        </div>
      </div>
    </div>
  )
}

const DoctorHeader=({account})=>{
  const{isLight,setIsLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  return(
    <header className={`flex justify-between items-center px-8 py-4 sticky top-0 z-10 ${isLight?'bg-slate-50/80':'bg-nl-dark/80'} border-b ${theme.border}`}>
      <div className="relative"><Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} size={18}/><input type="text" placeholder="Search patients or records..." className={`w-80 ${theme.bgPanel} border ${theme.border} ${theme.textPrimary} rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-nl-success transition-all`}/></div>
      <div className="flex items-center gap-4">
        <button onClick={()=>setIsLight(!isLight)} className={`p-2 rounded-full ${theme.bgInput} ${theme.textSecondary} hover:text-nl-success transition-colors`}>{isLight?<Moon size={20}/>:<Sun size={20}/>}</button>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>On-chain verified · {shortAddr(account)}</div>
      </div>
    </header>
  )
}

/* ── DOCTOR: My Patients ── */
const DoctorPatientsPage=({contract,account})=>{
  const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  const[patients,setPatients]=useState([]);const[loading,setLoading]=useState(true)
  useEffect(()=>{
    if(!contract||!account)return
    const load=async()=>{
      setLoading(true)
      try{
        const results=await Promise.all(KNOWN_PATIENT_IDS.map(async p=>{
          try{
            const[active,profile]=await Promise.all([contract.hasAccess(p.id,account),contract.patients(p.id)])
            let expiresAt=null
            if(active){
              const total=await contract.totalGrants()
              const from=Math.max(0,Number(total)-50)
              for(let i=Number(total)-1;i>=from;i--){
                try{const g=await contract.accessGrants(i);if(g.patientId===p.id&&g.doctorAddress.toLowerCase()===account.toLowerCase()&&g.active){expiresAt=Number(g.expiresAt);break}}catch{}
              }
            }
            return{...p,hasAccess:active,recordCount:Number(profile.recordCount),active:profile.active,expiresAt}
          }catch{return{...p,hasAccess:false,recordCount:0,active:false,expiresAt:null}}
        }))
        setPatients(results)
      }catch(e){console.error(e)}
      setLoading(false)
    }
    load()
  },[contract,account])
  const getExpiryLabel=(ts)=>{if(!ts)return null;const diff=ts*1000-Date.now();if(diff<=0)return'Expired';const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000);return h>0?`${h}h ${m}m remaining`:`${m}m remaining`}
  const granted=patients.filter(p=>p.hasAccess);const noAccess=patients.filter(p=>!p.hasAccess)
  return(
    <div className={`p-8 pt-4 ${theme.bgBase} min-h-full`}>
      <h2 className={`text-3xl font-bold mb-2 tracking-tight ${theme.textPrimary}`}>My Patients</h2>
      <p className={`${theme.textSecondary} mb-8`}>Patients who have granted you on-chain access to their records.</p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[{label:'Active access grants',value:granted.length,color:'text-nl-success'},{label:'Expiring within 6 h',value:granted.filter(p=>p.expiresAt&&(p.expiresAt*1000-Date.now())<6*3600*1000).length,color:'text-amber-500'},{label:'Total known patients',value:patients.length,color:theme.textPrimary}].map(s=>(
          <div key={s.label} className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-5`}><p className={`text-xs font-semibold uppercase tracking-wider ${theme.textSecondary} mb-2`}>{s.label}</p><p className={`text-3xl font-bold ${s.color}`}>{loading?'—':s.value}</p></div>
        ))}
      </div>
      {loading?(<div className="space-y-3 animate-pulse">{[1,2,3].map(i=><div key={i} className={`h-20 rounded-2xl ${theme.bgInput}`}/>)}</div>):(
        <>
          <h3 className={`text-base font-bold mb-3 ${theme.textPrimary}`}>Active Grants</h3>
          {granted.length===0?(<div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-10 text-center mb-6`}><Users size={32} className={`${theme.textMuted} mx-auto mb-3`}/><p className={`${theme.textSecondary} text-sm`}>No patients have granted you access yet.</p></div>):(
            <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl mb-6 overflow-hidden`}>
              {granted.map((p,i)=>{
                const expLabel=getExpiryLabel(p.expiresAt);const soon=p.expiresAt&&(p.expiresAt*1000-Date.now())<6*3600*1000
                return(<div key={p.id} className={`flex items-center gap-4 px-6 py-4 ${theme.bgHover} transition-colors cursor-pointer ${i<granted.length-1?`border-b ${theme.border}`:''}`}>
                  <div className="w-10 h-10 rounded-full bg-nl-accent/20 flex items-center justify-center text-nl-accent font-bold text-sm flex-shrink-0">{p.initials}</div>
                  <div className="flex-1 min-w-0"><p className={`font-bold ${theme.textPrimary}`}>{p.name}</p><p className={`text-xs ${theme.textMuted} font-mono mt-0.5 truncate`}>{shortHash(p.id)} · {p.recordCount} record{p.recordCount!==1?'s':''}{expLabel&&` · ${expLabel}`}</p></div>
                  <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full ${soon?'bg-amber-100 text-amber-700 border border-amber-200':'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>{soon?'Expires soon':'Active'}</span>
                </div>)
              })}
            </div>
          )}
          <h3 className={`text-base font-bold mb-3 ${theme.textPrimary}`}>No Access</h3>
          <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl overflow-hidden`}>
            {noAccess.map((p,i)=>(<div key={p.id} className={`flex items-center gap-4 px-6 py-4 ${i<noAccess.length-1?`border-b ${theme.border}`:''}`}>
              <div className={`w-10 h-10 rounded-full ${theme.bgInput} flex items-center justify-center font-bold text-sm flex-shrink-0 ${theme.textMuted}`}>{p.initials}</div>
              <div className="flex-1 min-w-0"><p className={`font-bold ${theme.textSecondary}`}>{p.name}</p><p className={`text-xs ${theme.textMuted} font-mono mt-0.5`}>{shortHash(p.id)}</p></div>
              <span className="text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">No access</span>
            </div>))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── DOCTOR: Record Viewer ── */
const DoctorRecordViewerPage=({contract,account})=>{
  const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  const[selectedPatient,setSelectedPatient]=useState(null);const[accessOk,setAccessOk]=useState(false)
  const[records,setRecords]=useState([]);const[totalRec,setTotalRec]=useState(0)
  const[loadingRec,setLoadingRec]=useState(false);const[ipfsFiles,setIpfsFiles]=useState([])
  const[activeTab,setActiveTab]=useState('records');const[copiedHash,setCopiedHash]=useState(null)
  const loadPatient=async(patient)=>{
    setSelectedPatient(patient);setRecords([]);setIpfsFiles([]);setLoadingRec(true)
    try{
      const ok=await contract.hasAccess(patient.id,account);setAccessOk(ok)
      if(ok){
        const[page,total]=await contract.getPatientRecords(patient.id,0,20);setTotalRec(Number(total))
        const recs=await Promise.all(page.map(async rid=>{try{const r=await contract.getRecord(Number(rid));return{id:Number(rid),timestamp:Number(r.timestamp),merkleRoot:r.merkleRoot,classification:r.classification,confidenceBps:Number(r.confidenceBps),anomalyFlagged:r.anomalyFlagged,submittingDoctor:r.submittingDoctor}}catch{return null}}))
        setRecords(recs.filter(Boolean))
        try{const r=await fetch(`${RELAYER_URL}/doctor/records/${patient.id.replace('0x','')}?doctor_address=${account}`);const d=await r.json();if(d.files)setIpfsFiles(d.files)}catch{}
      }
    }catch(e){console.error(e);setAccessOk(false)}
    setLoadingRec(false)
  }
  const copyHash=(h)=>{navigator.clipboard.writeText(h);setCopiedHash(h);setTimeout(()=>setCopiedHash(null),1800)}
  return(
    <div className={`p-8 pt-4 ${theme.bgBase} min-h-full`}>
      <h2 className={`text-3xl font-bold mb-2 tracking-tight ${theme.textPrimary}`}>Record Viewer</h2>
      <p className={`${theme.textSecondary} mb-6`}>View diagnostic records for patients who have granted you access.</p>
      <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-5 mb-6`}>
        <label className={`text-[10px] font-black ${theme.textMuted} uppercase tracking-widest mb-3 block`}>Select Patient</label>
        <div className="flex flex-wrap gap-3">
          {KNOWN_PATIENT_IDS.map(p=>(<button key={p.id} onClick={()=>loadPatient(p)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${selectedPatient?.id===p.id?'bg-nl-accent text-white border-nl-accent':`${theme.bgInput} ${theme.textPrimary} ${theme.border} hover:border-nl-accent`}`}><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${selectedPatient?.id===p.id?'bg-white/20 text-white':'bg-nl-accent/20 text-nl-accent'}`}>{p.initials}</div>{p.name}</button>))}
        </div>
      </div>
      {selectedPatient&&!loadingRec&&!accessOk&&(<div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 mb-6"><XCircle size={20} className="text-red-500 flex-shrink-0"/><div><p className="font-bold text-red-700 text-sm">Access not granted</p><p className="text-red-500 text-xs mt-0.5">{selectedPatient.name} has not granted you on-chain access.</p></div></div>)}
      {selectedPatient&&accessOk&&(
        <>
          <div className={`${theme.bgPanel} border border-nl-success/30 rounded-2xl p-5 mb-6`}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-nl-accent/20 flex items-center justify-center text-nl-accent font-bold">{selectedPatient.initials}</div>
              <div className="flex-1"><p className={`font-bold text-lg ${theme.textPrimary}`}>{selectedPatient.name}</p><p className={`text-xs font-mono ${theme.textMuted} mt-0.5`}>{selectedPatient.id}</p></div>
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl"><CheckCircle2 size={14}/>Access verified on-chain</div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-nl-success/20">
              {[{k:'On-chain records',v:totalRec},{k:'IPFS files',v:ipfsFiles.length},{k:'Access status',v:'Active grant'}].map(({k,v})=>(<div key={k} className={`${theme.bgInput} rounded-xl p-3 border ${theme.border}`}><p className={`text-[10px] ${theme.textMuted} uppercase tracking-widest font-bold mb-1`}>{k}</p><p className={`text-sm font-bold ${theme.textPrimary}`}>{v}</p></div>))}
            </div>
          </div>
          <div className={`flex gap-0 border-b ${theme.border} mb-5`}>
            {[['records','Diagnostic Records'],['ipfs','IPFS Files']].map(([key,label])=>(<button key={key} onClick={()=>setActiveTab(key)} className={`px-5 py-3 text-sm font-bold border-b-2 -mb-px transition-colors ${activeTab===key?'border-nl-accent text-nl-accent':`border-transparent ${theme.textSecondary}`}`}>{label}</button>))}
          </div>
          {activeTab==='records'&&(loadingRec?(<div className="space-y-2 animate-pulse">{[1,2,3].map(i=><div key={i} className={`h-14 rounded-xl ${theme.bgInput}`}/>)}</div>):records.length===0?(<div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-10 text-center`}><ClipboardList size={32} className={`${theme.textMuted} mx-auto mb-3`}/><p className={`${theme.textSecondary} text-sm`}>No on-chain records found.</p></div>):(
            <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl overflow-hidden`}>
              <table className="w-full text-sm">
                <thead className={`text-xs ${theme.textMuted} uppercase tracking-wider border-b ${theme.border}`}><tr>{['#','Time','Classification','Confidence','Anomaly','Merkle Root','Doctor'].map(h=><th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody className={theme.divider}>
                  {records.map(r=>(<tr key={r.id} className={`${theme.bgHover} transition-colors`}>
                    <td className={`px-4 py-3 font-bold ${theme.textPrimary}`}>{r.id}</td>
                    <td className={`px-4 py-3 text-xs ${theme.textSecondary}`}>{formatTs(r.timestamp)}</td>
                    <td className="px-4 py-3"><span className="bg-nl-accent/10 text-nl-accent border border-nl-accent/20 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{classLabel(r.classification)}</span></td>
                    <td className={`px-4 py-3 font-bold ${theme.textPrimary}`}>{(r.confidenceBps/100).toFixed(1)}%</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.anomalyFlagged?'bg-red-50 text-red-600 border border-red-200':'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{r.anomalyFlagged?'Flagged':'None'}</span></td>
                    <td className="px-4 py-3"><button onClick={()=>copyHash(r.merkleRoot)} className={`flex items-center gap-1 font-mono text-xs ${theme.textMuted} hover:text-nl-accent`}>{shortHash(r.merkleRoot)}{copiedHash===r.merkleRoot?<Check size={11} className="text-nl-success"/>:<Copy size={11} className="opacity-60"/>}</button></td>
                    <td className={`px-4 py-3 font-mono text-xs ${theme.textMuted}`}>{shortAddr(r.submittingDoctor)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ))}
          {activeTab==='ipfs'&&(ipfsFiles.length===0?(<div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-10 text-center`}><FileArchive size={32} className={`${theme.textMuted} mx-auto mb-3`}/><p className={`${theme.textSecondary} text-sm`}>No IPFS files found.</p></div>):(
            <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl overflow-hidden`}>
              <table className="w-full text-sm">
                <thead className={`text-xs ${theme.textMuted} uppercase tracking-wider border-b ${theme.border}`}><tr>{['File Name','IPFS CID','Status','Action'].map(h=><th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody className={theme.divider}>
                  {ipfsFiles.map(f=>(<tr key={f.id} className={`${theme.bgHover} transition-colors`}>
                    <td className={`px-4 py-3 font-bold ${theme.textPrimary}`}><div className="flex items-center gap-2"><FileArchive size={15} className="text-nl-accent flex-shrink-0"/>{f.filename}</div></td>
                    <td className="px-4 py-3"><button onClick={()=>copyHash(f.ipfs_cid)} className={`flex items-center gap-1 font-mono text-xs ${theme.textMuted} hover:text-nl-accent`}>{f.ipfs_cid.slice(0,20)}...{copiedHash===f.ipfs_cid?<Check size={11} className="text-nl-success"/>:<Copy size={11} className="opacity-60"/>}</button></td>
                    <td className="px-4 py-3"><span className="bg-nl-success/10 text-nl-success text-[10px] font-bold px-2 py-0.5 rounded-full">Secured on IPFS</span></td>
                    <td className="px-4 py-3"><a href={`https://gateway.pinata.cloud/ipfs/${f.ipfs_cid}`} target="_blank" rel="noreferrer" className="text-nl-accent hover:underline flex items-center gap-1 text-xs font-bold">View <Eye size={12}/></a></td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
      {!selectedPatient&&(<div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-12 text-center`}><ClipboardList size={40} className={`${theme.textMuted} mx-auto mb-4`}/><p className={`font-bold ${theme.textPrimary} mb-2`}>Select a patient above</p><p className={`text-sm ${theme.textSecondary}`}>Only patients who have granted you access will show records.</p></div>)}
    </div>
  )
}

/* ── DOCTOR: Access Log ── */
const DoctorAccessLogPage=({contract,account})=>{
  const{isLight}=useContext(ThemeContext);const theme=getTheme(isLight)
  const[grants,setGrants]=useState([]);const[loading,setLoading]=useState(true);const[refreshing,setRefreshing]=useState(false)
  const loadGrants=async()=>{
    if(!contract||!account)return;setRefreshing(true)
    try{
      const total=await contract.totalGrants();const from=Math.max(0,Number(total)-100);const found=[]
      for(let i=Number(total)-1;i>=from;i--){
        try{
          const g=await contract.accessGrants(i)
          if(g.doctorAddress.toLowerCase()===account.toLowerCase()){
            const known=KNOWN_PATIENT_IDS.find(p=>p.id===g.patientId)
            found.push({id:i,patientId:g.patientId,patientName:known?.name||shortHash(g.patientId),patientInitials:known?.initials||'?',grantedAt:Number(g.grantedAt),expiresAt:Number(g.expiresAt),active:g.active,purposeHash:g.purposeHash})
          }
        }catch{}
      }
      setGrants(found)
    }catch(e){console.error(e)}
    setLoading(false);setRefreshing(false)
  }
  useEffect(()=>{loadGrants()},[contract,account])
  const getStatus=(g)=>{if(!g.active)return{label:'Revoked',style:'bg-red-50 text-red-600 border border-red-200'};if(g.expiresAt*1000<Date.now())return{label:'Expired',style:'bg-amber-50 text-amber-700 border border-amber-200'};return{label:'Active',style:'bg-emerald-50 text-emerald-700 border border-emerald-200'}}
  const activeCount=grants.filter(g=>g.active&&g.expiresAt*1000>=Date.now()).length;const revokedCount=grants.filter(g=>!g.active).length
  return(
    <div className={`p-8 pt-4 ${theme.bgBase} min-h-full`}>
      <div className="flex items-center justify-between mb-2"><h2 className={`text-3xl font-bold tracking-tight ${theme.textPrimary}`}>Access Log</h2><button onClick={loadGrants} disabled={refreshing} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${theme.bgInput} ${theme.textSecondary} hover:text-nl-accent border ${theme.border}`}><RefreshCw size={14} className={refreshing?'animate-spin':''}/>{refreshing?'Refreshing...':'Refresh'}</button></div>
      <p className={`${theme.textSecondary} mb-2`}>On-chain history of all access grants issued to you.</p>
      <p className={`text-xs ${theme.textSecondary} mb-6`}>All events are permanently recorded via the <span className="font-mono">MetaTxExecuted</span> and <span className="font-mono">AccessRevoked</span> smart contract events.</p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[{label:'Total grants found',value:grants.length,color:theme.textPrimary},{label:'Currently active',value:activeCount,color:'text-nl-success'},{label:'Revoked',value:revokedCount,color:'text-red-500'}].map(s=>(<div key={s.label} className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-5`}><p className={`text-xs font-semibold uppercase tracking-wider ${theme.textSecondary} mb-2`}>{s.label}</p><p className={`text-3xl font-bold ${s.color}`}>{loading?'—':s.value}</p></div>))}
      </div>
      {loading?(<div className="space-y-2 animate-pulse">{[1,2,3,4].map(i=><div key={i} className={`h-16 rounded-2xl ${theme.bgInput}`}/>)}</div>):grants.length===0?(<div className={`${theme.bgPanel} border ${theme.border} rounded-2xl p-10 text-center`}><History size={32} className={`${theme.textMuted} mx-auto mb-3`}/><p className={`${theme.textSecondary} text-sm`}>No access grants found for your address.</p></div>):(
        <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className={`text-xs ${theme.textMuted} uppercase tracking-wider border-b ${theme.border}`}><tr>{['Grant #','Patient','Granted At','Expires At','Status','Purpose Hash'].map(h=><th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody className={theme.divider}>
              {grants.map(g=>{const s=getStatus(g);return(<tr key={g.id} className={`${theme.bgHover} transition-colors`}>
                <td className={`px-4 py-3 font-mono text-xs font-bold ${theme.textPrimary}`}>#{g.id}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-nl-accent/20 flex items-center justify-center text-nl-accent text-xs font-bold flex-shrink-0">{g.patientInitials}</div><span className={`font-bold ${theme.textPrimary}`}>{g.patientName}</span></div></td>
                <td className={`px-4 py-3 text-xs ${theme.textSecondary}`}>{formatTs(g.grantedAt)}</td>
                <td className={`px-4 py-3 text-xs ${theme.textSecondary}`}>{formatTs(g.expiresAt)}</td>
                <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.style}`}>{s.label}</span></td>
                <td className="px-4 py-3"><span className={`font-mono text-xs ${theme.textMuted}`}>{shortHash(g.purposeHash)}</span></td>
              </tr>)})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   APP ROOT
════════════════════════════════════════════════════════════════════════════ */
export default function App(){
  const[account,setAccount]=useState("");const[status,setStatus]=useState("");const[hasAccess,setHasAccess]=useState(false)
  const[txHash,setTxHash]=useState(null) 
  const[isLightMode,setIsLightMode]=useState(true);const[patientId]=useState("0x"+"02".repeat(32))
  const[targetDoctor,setTargetDoctor]=useState(DOCTORS[0].address);const[heartRate]=useState(72);const[sleepQuality]=useState(88);const[cognitiveLoad]=useState(42)
  const[metaTxNonce,setMetaTxNonce]=useState(0);const[portalMode,setPortalMode]=useState('idle')
  const[contractRef,setContractRef]=useState(null);const[doctorProfile,setDoctorProfile]=useState(null)

  // 👇 ADDED: Simulate a successful traditional email login
  const simulateEmailLogin = () => {
    setAccount("0x0000000000000000000000000000000000000000"); // Dummy patient account
    setPortalMode('patient');
  };

  const connectWallet=async()=>{
    if(!window.ethereum)return alert("Please install a Web3 wallet like Rabby or MetaMask")
    try{
      // ✅ FIX: Check network is Sepolia before proceeding
      const chainId = await window.ethereum.request({method:'eth_chainId'})
      if(chainId !== '0xaa36a7'){
        try{
          await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]})
        }catch(switchErr){
          return alert('Please switch your wallet to the Sepolia Testnet (Chain ID: 11155111) and try again.')
        }
      }
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'});const addr=accounts[0];setAccount(addr);setPortalMode('detecting')
      try{
        const provider=new ethers.BrowserProvider(window.ethereum);const signer=await provider.getSigner()
        const contract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer);setContractRef(contract)
        // ✅ FIX: Wrap doctors() call defensively — BAD_DATA if wrong network/contract
        let isDoctor=false
        try{isDoctor=await contract.doctors(addr)}catch(e){console.warn('[Contract] doctors() failed:',e.shortMessage||e.message)}
        if(isDoctor){setDoctorProfile(getDoctorProfile(addr));setPortalMode('doctor');return}
        setPortalMode('patient')
        try{const nonce=await contract.getPatientNonce(patientId);setMetaTxNonce(Number(nonce));setStatus(`Wallet connected. Nonce: ${nonce}`)}catch{}
      }catch(e){console.warn(e.message);setPortalMode('patient')}
    }catch{}
  }
  const disconnectWallet=()=>{setAccount("");setStatus("");setHasAccess(false);setTxHash(null);setPortalMode('idle');setContractRef(null);setDoctorProfile(null)}

  // SIGNATURE CHAIN ID SET TO SEPOLIA (11155111)
  const grantAccessMeta=async()=>{
    if(!account)return alert("Connect Wallet first")
    try{
      setTxHash(null)
      const provider=new ethers.BrowserProvider(window.ethereum),signer=await provider.getSigner()
      const contract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer)
      // ✅ FIX: Wrap patients() call defensively — BAD_DATA if patient not registered or wrong network
      try{
        const profile=await contract.patients(patientId)
        if(profile.controllerAddress && profile.controllerAddress !== ethers.ZeroAddress &&
           account.toLowerCase()!==profile.controllerAddress.toLowerCase())
          return setStatus(`Wrong wallet! Expected: ${profile.controllerAddress.slice(0,8)}...`)
      }catch(e){
        console.warn('[Contract] patients() check skipped:',e.shortMessage||e.message)
        // Patient not yet registered on-chain — proceed anyway and let the relayer handle it
      }
      setStatus(`Signing Gasless Meta-Tx (Nonce: ${metaTxNonce})...`)
      const purposeHash="0x"+"aa".repeat(32)
      const res=await fetch(`${RELAYER_URL}/meta/grant-digest?patientId=${patientId}&doctor=${targetDoctor}&durationSecs=86400&purposeHash=${purposeHash}&nonce=${metaTxNonce}`)
      let td=await res.json();
      td.domain.chainId=11155111; // SEPOLIA CHAIN ID
      td.domain.verifyingContract=CONTRACT_ADDRESS;td.message.durationSecs=Number(td.message.durationSecs);td.message.nonce=Number(td.message.nonce);delete td.types.EIP712Domain
      const sig=await signer.signTypedData(td.domain,td.types,td.message)
      const sr=await fetch(`${RELAYER_URL}/meta/grant-access`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patient_id_hex:patientId,doctor_address:targetDoctor,duration_secs:86400,purpose_hash:purposeHash,signature:sig})})
      const ft=await sr.json()
      if(ft.tx_hash){
        setStatus(``); 
        setTxHash(ft.tx_hash); 
        setMetaTxNonce(p=>p+1);
        setTimeout(checkAccess,3000);
      }else{
        setStatus(`Relayer error: ${JSON.stringify(ft)}`)
      }
    }catch(e){setStatus(`Error: ${e.message}`)}
  }

  // SIGNATURE CHAIN ID SET TO SEPOLIA (11155111)
  const revokeAccessMeta=async()=>{
    if(!account)return alert("Connect Wallet first")
    try{
      setTxHash(null) 
      const provider=new ethers.BrowserProvider(window.ethereum),signer=await provider.getSigner()
      setStatus(`Signing Revoke Meta-Tx (Nonce: ${metaTxNonce})...`)
      const res=await fetch(`${RELAYER_URL}/meta/revoke-digest?patientId=${patientId}&doctor=${targetDoctor}&nonce=${metaTxNonce}`)
      let td=await res.json();
      td.domain.chainId=11155111; // SEPOLIA CHAIN ID
      td.domain.verifyingContract=CONTRACT_ADDRESS;td.message.nonce=Number(td.message.nonce);delete td.types.EIP712Domain
      const sig=await signer.signTypedData(td.domain,td.types,td.message)
      const sr=await fetch(`${RELAYER_URL}/meta/revoke-access`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patient_id_hex:patientId,doctor_address:targetDoctor,signature:sig})})
      const ft=await sr.json()
      if(ft.tx_hash){
        setStatus(``); 
        setTxHash(ft.tx_hash); 
        setMetaTxNonce(p=>p+1);
        setHasAccess(false);
      }else{
        setStatus(`Revoke error: ${JSON.stringify(ft)}`)
      }
    }catch(e){setStatus(`Error: ${e.message}`)}
  }

  const checkAccess=async()=>{
    try{
      setStatus("Querying blockchain state...")
      const provider=new ethers.BrowserProvider(window.ethereum),signer=await provider.getSigner()
      const contract=new ethers.Contract(CONTRACT_ADDRESS,CONTRACT_ABI,signer)
      const access=await contract.hasAccess(patientId,targetDoctor);setHasAccess(access)
      setStatus(access?"On-Chain Verification: Access GRANTED ✅":"On-Chain Verification: Access PENDING ⏳")
    }catch(e){setStatus(`Error: ${e.shortMessage||e.message?.substring(0,100)}`)}
  }

  // 👇 UPDATED: Passed onEmailLogin down to the LoginPage component
  if(portalMode === 'idle' && !account) {
    return(
      <ThemeContext.Provider value={{isLight:isLightMode, setIsLight:setIsLightMode}}>
        <LoginPage connectWallet={connectWallet} onEmailLogin={simulateEmailLogin} />
      </ThemeContext.Provider>
    )
  }

  if(portalMode==='detecting'){return(
    <ThemeContext.Provider value={{isLight:isLightMode,setIsLight:setIsLightMode}}>
      <div className={`flex items-center justify-center h-screen ${isLightMode?'bg-slate-50':'bg-nl-dark'}`}>
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-nl-accent border-t-transparent rounded-full animate-spin mx-auto"/>
          <p className={`font-bold ${isLightMode?'text-slate-900':'text-white'}`}>Detecting portal role...</p>
          <p className={`text-sm ${isLightMode?'text-slate-500':'text-gray-400'}`}>Checking on-chain registration</p>
        </div>
      </div>
    </ThemeContext.Provider>
  )}

  if(portalMode==='doctor'&&doctorProfile){return(
    <ThemeContext.Provider value={{isLight:isLightMode,setIsLight:setIsLightMode}}>
      <Router>
        <div className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${isLightMode?'bg-slate-50 text-slate-900':'bg-nl-dark text-white'}`}>
          <DoctorSidebar account={account} disconnectWallet={disconnectWallet} doctorProfile={doctorProfile}/>
          <div className="flex-1 flex flex-col overflow-y-auto">
            <DoctorHeader account={account}/>
            <Routes>
              <Route path="/"                element={<Navigate to="/doctor/patients" replace/>}/>
              <Route path="/doctor/patients" element={<ErrorBoundary><DoctorPatientsPage    contract={contractRef} account={account}/></ErrorBoundary>}/>
              <Route path="/doctor/records"  element={<ErrorBoundary><DoctorRecordViewerPage contract={contractRef} account={account}/></ErrorBoundary>}/>
              <Route path="/doctor/access"   element={<ErrorBoundary><DoctorAccessLogPage   contract={contractRef} account={account}/></ErrorBoundary>}/>
              <Route path="*"                element={<Navigate to="/doctor/patients" replace/>}/>
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeContext.Provider>
  )}

  return(
    <ThemeContext.Provider value={{isLight:isLightMode,setIsLight:setIsLightMode}}>
      <Router>
        <div className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${isLightMode ? 'bg-slate-50 text-slate-900' : 'bg-nl-dark text-white'}`}>
          <Sidebar account={account} disconnectWallet={disconnectWallet}/>
          <div className="flex-1 flex flex-col overflow-y-auto relative scroll-smooth">
            <Header account={account} connectWallet={connectWallet} disconnectWallet={disconnectWallet}/>
            <Routes>
              <Route path="/"             element={<ErrorBoundary><DashboardPage account={account} status={status} txHash={txHash} hasAccess={hasAccess} checkAccess={checkAccess} grantAccessMeta={grantAccessMeta} revokeAccessMeta={revokeAccessMeta} patientId={patientId} targetDoctor={targetDoctor} setTargetDoctor={setTargetDoctor} heartRate={heartRate} sleepQuality={sleepQuality} cognitiveLoad={cognitiveLoad}/></ErrorBoundary>}/>
              <Route path="/records"      element={<ErrorBoundary><HealthRecordsPage/></ErrorBoundary>}/>
              <Route path="/appointments" element={<ErrorBoundary><AppointmentsPage/></ErrorBoundary>}/>
              <Route path="/messages"     element={<ErrorBoundary><MessagesPage heartRate={heartRate} sleepQuality={sleepQuality} cognitiveLoad={cognitiveLoad}/></ErrorBoundary>}/>
              <Route path="/settings"     element={<ErrorBoundary><SettingsPage account={account} disconnectWallet={disconnectWallet}/></ErrorBoundary>}/>
              <Route path="*"             element={<Navigate to="/" replace/>}/>
            </Routes>
          </div>
        </div>
      </Router>
    </ThemeContext.Provider>
  )
}