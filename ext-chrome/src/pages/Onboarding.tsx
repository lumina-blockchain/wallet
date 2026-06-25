import { useState, useEffect } from 'react'
import { useWalletStore } from '../store/useWalletStore'
import { Shield, Lock, AlertTriangle, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Onboarding() {
  const [step, setStep] = useState<'start' | 'password' | 'backup' | 'verify' | 'import' | 'unlock'>('start')
  const [mode, setMode] = useState<'create' | 'import' | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  
  const [verifyIndices, setVerifyIndices] = useState<number[]>([])
  const [verifyInputs, setVerifyInputs] = useState<{ [key: number]: string }>({})

  const { createWallet, importWallet, hasWallet, unlock, mnemonic, isLocked, isVerified, verifyWallet } = useWalletStore()

  useEffect(() => {
    // 1. Jika terkunci -> Ke layar Unlock
    if (hasWallet && isLocked && step !== 'password' && step !== 'import') {
      setStep('unlock')
    }
    // 2. Jika sudah terbuka tapi belum verifikasi -> Langsung ke Backup
    else if (hasWallet && !isLocked && !isVerified && step !== 'verify') {
      setStep('backup')
    }
  }, [hasWallet, isLocked, isVerified, step])

  const handleSetPassword = async () => {
    if (password.length < 6) return setError('Password min. 6 characters')
    if (password !== confirmPassword) return setError('Passwords do not match')
    
    setError('')
    if (mode === 'create') {
      await createWallet(password)
      setStep('backup')
    } else {
      setStep('import')
    }
  }

  const handleUnlock = async () => {
    const success = await unlock(password)
    if (!success) setError('Incorrect password')
  }

  const handleImport = async () => {
    try {
      await importWallet(mnemonicInput, password)
    } catch (e) {
      setError('Invalid recovery phrase or key')
    }
  }

  const startVerification = () => {
    const idx1 = Math.floor(Math.random() * 6)
    const idx2 = Math.floor(Math.random() * 6) + 6
    setVerifyIndices([idx1, idx2])
    setStep('verify')
  }

  const handleVerify = async () => {
    const words = mnemonic?.split(' ') || []
    const isCorrect = verifyIndices.every(idx => 
      verifyInputs[idx]?.trim().toLowerCase() === words[idx].toLowerCase()
    )

    if (isCorrect) {
      await verifyWallet()
    } else {
      setError('Wrong words! Please check your backup.')
    }
  }

  const copyToClipboard = () => {
    if (mnemonic) {
      navigator.clipboard.writeText(mnemonic)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 items-center justify-center relative overflow-hidden bg-background text-white select-none">
      <div className="absolute top-[-20%] left-[-20%] w-80 h-80 bg-primary/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-20%] right-[-20%] w-80 h-80 bg-secondary/10 rounded-full blur-[100px]" />

      <AnimatePresence mode="wait">
        {step === 'start' && (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full space-y-10 z-10 text-center">
            <div className="space-y-4">
              <div className="w-20 h-20 bg-cyber-gradient rounded-[2rem] mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(0,242,255,0.3)]">
                <Shield className="text-white w-10 h-10" />
              </div>
              <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white">BigChain</h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Smart Web3 Vault</p>
            </div>
            <div className="space-y-3 pt-6">
              <button onClick={() => { setMode('create'); setStep('password'); }} className="w-full cyber-button py-4">Create New Wallet</button>
              <button onClick={() => { setMode('import'); setStep('password'); }} className="w-full bg-white/5 border border-white/10 py-4 rounded-xl font-bold transition-all">Import Wallet</button>
            </div>
          </motion.div>
        )}

        {step === 'password' && (
          <motion.div key="password" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="w-full space-y-6 z-10">
            <h2 className="text-2xl font-bold italic">Initialize Security</h2>
            <div className="space-y-4">
              <input type="password" placeholder="New Password" className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-sm outline-none" onChange={(e) => setPassword(e.target.value)} />
              <input type="password" placeholder="Confirm Password" className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-sm outline-none" onChange={(e) => setConfirmPassword(e.target.value)} />
              {error && <p className="text-[10px] text-red-400 font-bold uppercase">{error}</p>}
            </div>
            <button onClick={handleSetPassword} className="w-full cyber-button py-4">Continue</button>
          </motion.div>
        )}

        {step === 'backup' && (
          <motion.div key="backup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full flex flex-col z-10">
            <div className="flex-1 space-y-4 overflow-y-auto">
               <h2 className="text-xl font-bold italic uppercase">Secret Phrase</h2>
               <div className="bg-white/5 border border-white/10 p-4 rounded-2xl grid grid-cols-3 gap-2">
                {mnemonic?.split(' ').map((word, i) => (
                  <div key={i} className="bg-white/5 p-2 rounded-lg flex items-center gap-2">
                    <span className="text-[8px] text-slate-500">{i + 1}</span>
                    <span className="text-[10px] font-mono">{word}</span>
                  </div>
                ))}
              </div>
              <button 
                onClick={copyToClipboard} 
                className={`w-full border py-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                  copied 
                  ? 'bg-[#00ff88]/20 border-[#00ff88]/40 text-[#00ff88] scale-[1.02]' 
                  : 'bg-white/5 border-white/10 text-primary hover:bg-white/10'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'COPIED TO CLIPBOARD!' : 'COPY ALL WORDS'}
              </button>
              <div className="bg-red-500/10 p-3 rounded-xl flex gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-[9px] text-red-300 font-bold">Never share this. If lost, your BIG is gone.</p>
              </div>
            </div>
            <button onClick={startVerification} className="w-full cyber-button py-4 mt-4">I've Saved It</button>
          </motion.div>
        )}

        {step === 'verify' && (
          <motion.div key="verify" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="w-full space-y-6 z-10">
            <h2 className="text-2xl font-bold italic">Verify Backup</h2>
            <div className="space-y-4">
              {verifyIndices.map(idx => (
                <div key={idx} className="space-y-2">
                  <label className="text-[10px] font-bold text-primary">WORD #{idx + 1}</label>
                  <input type="text" placeholder="..." className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm outline-none" onChange={(e) => setVerifyInputs({ ...verifyInputs, [idx]: e.target.value })} />
                </div>
              ))}
              {error && <p className="text-[10px] text-red-400 font-bold uppercase">{error}</p>}
            </div>
            <button onClick={handleVerify} className="w-full cyber-button py-4">Finish Setup</button>
          </motion.div>
        )}

        {step === 'unlock' && (
          <motion.div key="unlock" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-8 z-10 text-center">
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl mx-auto flex items-center justify-center">
              <Lock className="text-primary w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tighter uppercase italic">BigChain Locked</h2>
            <div className="space-y-4">
              <input type="password" autoFocus placeholder="Enter Password" className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-center outline-none focus:border-primary" onChange={(e) => { setPassword(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleUnlock()} />
              {error && <p className="text-[10px] text-red-400 font-bold uppercase">{error}</p>}
              <button onClick={handleUnlock} className="w-full cyber-button py-4">Unlock Wallet</button>
            </div>
            <button onClick={() => { if(confirm("DELETE WALLET?")) useWalletStore.getState().logout() }} className="text-[10px] text-slate-600 hover:text-red-400 font-bold uppercase tracking-widest">Destroy Vault</button>
          </motion.div>
        )}

        {step === 'import' && (
          <motion.div key="import" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="w-full h-full flex flex-col z-10">
            <div className="flex-1 space-y-4">
              <h2 className="text-2xl font-bold italic">Restore Vault</h2>
              <textarea className="w-full h-44 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-mono outline-none resize-none" placeholder="word1 word2 ..." onChange={(e) => setMnemonicInput(e.target.value)} />
              {error && <p className="text-[10px] text-red-400 font-bold uppercase">{error}</p>}
            </div>
            <button onClick={handleImport} className="w-full cyber-button py-4 mt-4">Restore Wallet</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
