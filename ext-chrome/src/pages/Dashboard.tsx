import { useEffect, useState } from 'react'
import { useWalletStore } from '../store/useWalletStore'
import { 
  Wallet, Send, ArrowDownLeft, History, Settings, Copy, RefreshCcw, 
  Check, X, Loader2, Coins, Landmark, ShieldAlert, Globe, Trash2, Key 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ethers } from 'ethers'
import { QRCodeSVG } from 'qrcode.react'
import { cn } from '../lib/utils'
import { LuminaWallet, LuminaClient } from 'lumina-blockchain-sdk'

const DEFAULT_RPC = "https://rpc1.bariscode.my.id"

export default function Dashboard() {
  const { address, balance, history, fetchBalance, fetchActivity, logout, sendTransaction, privateKey } = useWalletStore()
  
  // Navigation
  const [activeTab, setActiveTab] = useState<'wallet' | 'tokens' | 'settings'>('wallet')
  
  // Shared States
  const [copied, setCopied] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showSend, setShowSend] = useState(false)
  
  // Custom RPC URL
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC)

  // Live Network States
  const [networkHeight, setNetworkHeight] = useState<number | null>(null)
  const [rpcStatus, setRpcStatus] = useState<'online' | 'offline'>('online')

  // Custom Dropdown Asset Selector States
  const [isOpenAssetSelect, setIsOpenAssetSelect] = useState(false)

  // Transaction Filter Tab State
  const [txFilter, setTxFilter] = useState<'all' | 'transfer' | 'tokens'>('all')

  // Load custom RPC on mount
  useEffect(() => {
    const savedRpc = localStorage.getItem('lumina_rpc_url')
    if (savedRpc) setRpcUrl(savedRpc)
  }, [])

  // Sync network status and block height on mount & RPC change
  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const client = new LuminaClient(rpcUrl)
        const stats = await client.getNetworkStats()
        if (stats && stats.total_height !== undefined) {
          setNetworkHeight(stats.total_height)
          setRpcStatus('online')
        } else {
          const latestBlock = await client.getLatestBlock()
          if (latestBlock && latestBlock.height !== undefined) {
            setNetworkHeight(latestBlock.height)
            setRpcStatus('online')
          }
        }
      } catch (e) {
        setRpcStatus('offline')
      }
    }
    checkNetwork()
    const interval = setInterval(checkNetwork, 6000)
    return () => clearInterval(interval)
  }, [rpcUrl])

  const saveRpcUrl = (newUrl: string) => {
    localStorage.setItem('lumina_rpc_url', newUrl)
    setRpcUrl(newUrl)
    window.location.reload() // Reload to apply new client instance
  }

  // --- TAB 1: SEND FORM STATES ---
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState('')

  // --- TAB 2: TOKENS TAB STATES ---
  const [importedTokens, setImportedTokens] = useState<any[]>([])
  const [showImportToken, setShowImportToken] = useState(false)
  const [tokenContractAddr, setTokenContractAddr] = useState('')
  const [verifyingToken, setVerifyingToken] = useState(false)
  const [tokenMeta, setTokenMeta] = useState<any>(null)
  const [importTokenError, setImportTokenError] = useState('')

  // Selected Asset state for Send
  const [selectedAsset, setSelectedAsset] = useState<any>({ symbol: 'LUM', decimals: 18, balance: '0', address: 'native' })
  
  // Selected transaction for details modal
  const [selectedTx, setSelectedTx] = useState<any>(null)

  // Modul pengurai payload transaksi dinamis (Lumina contract call & staking decoder)
  const parseTxData = (tx: any) => {
    if (!tx.data) return null
    
    // Jika data adalah string dan diawali dengan 'CALL:' atau 'STAKE:', langsung tangani sebagai teks
    if (typeof tx.data === 'string') {
      if (tx.data.startsWith('CALL:')) {
        const parts = tx.data.split(':')
        const contract = parts[1]
        const method = parts[2]
        const args = parts[3] ? parts[3].split(',') : []
        return {
          type: 'CONTRACT_CALL',
          contract,
          method,
          args
        }
      }
      if (tx.data.startsWith('STAKE:')) {
        const decoded = tx.data.substring(6)
        const parts = decoded.split(':')
        return {
          type: 'STAKING',
          nodeId: parts[0],
          blsKey: parts[1] || ''
        }
      }
    }

    // Fallback: decode hex string atau array byte biner
    let bytes: number[] = []
    if (Array.isArray(tx.data)) {
      bytes = tx.data
    } else if (typeof tx.data === 'string') {
      const cleanHex = tx.data.startsWith('0x') ? tx.data.substring(2) : tx.data
      if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
        for (let i = 0; i < cleanHex.length; i += 2) {
          bytes.push(parseInt(cleanHex.substring(i, i + 2), 16))
        }
      }
    }
    
    if (bytes.length === 0) return null

    // Cek awalan STAKE (83, 84, 65, 75, 69)
    const stakePrefix = [83, 84, 65, 75, 69]
    if (bytes.length >= 5 && bytes.slice(0, 5).every((val, idx) => val === stakePrefix[idx])) {
      try {
        const decoded = new TextDecoder().decode(new Uint8Array(bytes.slice(5)))
        const parts = decoded.split(':')
        return {
          type: 'STAKING',
          nodeId: parts[0],
          blsKey: parts[1] || ''
        }
      } catch (e) {}
    }

    // Cek awalan CALL:
    try {
      const decoded = new TextDecoder().decode(new Uint8Array(bytes))
      if (decoded.startsWith('CALL:')) {
        const parts = decoded.split(':')
        const contract = parts[1]
        const method = parts[2]
        const args = parts[3] ? parts[3].split(',') : []
        return {
          type: 'CONTRACT_CALL',
          contract,
          method,
          args
        }
      }
    } catch (e) {}

    return null
  }

  const getTxDetails = (tx: any) => {
    // 1. Cek token_info dari node/explorer terlebih dahulu (sumber utama terpercaya!)
    if (tx.token_info) {
      const isTokenOutgoing = tx.from === address
      const symbol = tx.token_info.token_symbol || 'LTS-20'
      
      // Ambil desimal token dari daftar impor jika terdaftar, default 18
      const token = importedTokens.find((t: any) => t.address.toLowerCase() === tx.token_info.contract_id.toLowerCase())
      const tokenDecimals = token ? token.decimals : 18
      
      let formattedAmount = '0.00'
      try {
        formattedAmount = parseFloat(ethers.formatUnits(tx.token_info.token_amount, tokenDecimals)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      } catch (e) {
        formattedAmount = tx.token_info.token_amount
      }

      return {
        title: isTokenOutgoing ? `Kirim ${symbol}` : `Terima ${symbol}`,
        icon: Coins,
        iconBg: isTokenOutgoing ? 'bg-amber-500/10 border-amber-500/20' : 'bg-[#00ff88]/10 border-[#00ff88]/20',
        iconColor: isTokenOutgoing ? 'text-amber-500' : 'text-[#00ff88]',
        amountText: `${formattedAmount} ${symbol}`,
        isNegative: isTokenOutgoing,
        method: `CALL:${tx.token_info.method}`,
        details: {
          type: 'CONTRACT_CALL',
          contract: tx.token_info.contract_id,
          method: tx.token_info.method,
          args: [tx.token_info.token_recipient, tx.token_info.token_amount]
        },
        recipient: tx.token_info.token_recipient
      }
    }

    // 2. Fallback: Parse dari tx.data
    const parsed = parseTxData(tx)
    const isIncoming = tx.to === address

    if (parsed?.type === 'STAKING') {
      return {
        title: 'Staking Delegasi',
        icon: Landmark,
        iconBg: 'bg-purple-500/10 border-purple-500/20',
        iconColor: 'text-purple-400',
        amountText: `${parseFloat(ethers.formatUnits(tx.value || '0', 18)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} LUM`,
        isNegative: true,
        method: 'STAKE',
        details: parsed
      }
    }

    if (parsed?.type === 'CONTRACT_CALL') {
      const isTransfer = parsed.method === 'transfer'
      if (isTransfer && parsed.args && parsed.args.length >= 2) {
        const recipient = parsed.args[0]
        const rawAmount = parsed.args[1]
        const token = importedTokens.find((t: any) => t.address.toLowerCase() === parsed.contract.toLowerCase())
        const symbol = token ? token.symbol : 'LTS-20'
        const decimals = token ? token.decimals : 18
        let formattedAmount = '0.00'
        try {
          formattedAmount = parseFloat(ethers.formatUnits(rawAmount, decimals)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        } catch (e) {
          formattedAmount = rawAmount
        }

        const isTokenOutgoing = tx.from === address

        return {
          title: isTokenOutgoing ? `Kirim ${symbol}` : `Terima ${symbol}`,
          icon: Coins,
          iconBg: isTokenOutgoing ? 'bg-amber-500/10 border-amber-500/20' : 'bg-[#00ff88]/10 border-[#00ff88]/20',
          iconColor: isTokenOutgoing ? 'text-amber-500' : 'text-[#00ff88]',
          amountText: `${formattedAmount} ${symbol}`,
          isNegative: isTokenOutgoing,
          method: `CALL:${parsed.method}`,
          details: parsed,
          recipient
        }
      }

      return {
        title: 'Panggilan Kontrak',
        icon: Globe,
        iconBg: 'bg-cyan-500/10 border-cyan-500/20',
        iconColor: 'text-cyan-400',
        amountText: `${parseFloat(ethers.formatUnits(tx.value || '0', 18)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} LUM`,
        isNegative: true,
        method: `CALL:${parsed.method}`,
        details: parsed
      }
    }

    // Standard Lumina Tx
    return {
      title: isIncoming ? 'Diterima' : 'Terkirim',
      icon: isIncoming ? ArrowDownLeft : Send,
      iconBg: isIncoming ? 'bg-[#00ff88]/10 border-[#00ff88]/20' : 'bg-primary/10 border-primary/20',
      iconColor: isIncoming ? 'text-[#00ff88]' : 'text-primary',
      amountText: `${parseFloat(ethers.formatUnits(tx.value || '0', 18)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} LUM`,
      isNegative: !isIncoming,
      method: 'TRANSFER',
      details: null
    }
  }

  // Filter history berdasarkan tab terpilih
  const filteredHistory = history.filter((tx: any) => {
    if (txFilter === 'all') return true
    if (txFilter === 'tokens') {
      return !!tx.token_info || parseTxData(tx)?.type === 'CONTRACT_CALL'
    }
    if (txFilter === 'transfer') {
      return !tx.token_info && !parseTxData(tx)
    }
    return true
  })

  // Sync selectedAsset balance whenever importedTokens or native balance updates
  useEffect(() => {
    if (selectedAsset.address === 'native') {
      setSelectedAsset((prev: any) => ({ ...prev, balance: ethers.formatUnits(balance, 18) }));
    } else {
      const found = importedTokens.find((t: any) => t.address === selectedAsset.address);
      if (found) {
        setSelectedAsset((prev: any) => ({ ...prev, balance: found.balance }));
      }
    }
  }, [balance, importedTokens, selectedAsset.address])

  // Fetch token list and balances on mount
  useEffect(() => {
    const loadTokens = async () => {
      const saved = localStorage.getItem(`lumina_tokens_${address}`)
      let list = saved ? JSON.parse(saved) : []
      
      // Query balance for each token dynamically using SDK
      if (address) {
        const client = new LuminaClient(rpcUrl)
        const updatedList = await Promise.all(list.map(async (tok: any) => {
          let updatedToken = { ...tok };
          
          // Ambil logo dari metadata secara dinamis jika belum ter-cache di localStorage
          if (!tok.logo) {
            try {
              const meta = await client.getContractMetadata(tok.address);
              if (meta && meta.metadata && meta.metadata.logo) {
                updatedToken.logo = meta.metadata.logo;
              }
            } catch (e) {}
          }

          try {
            // balanceOf/balance_of view-call
            const res = await client.getContractCall(tok.address, 'balance_of', [address])
            if (res) {
              let rawBal = "0";
              if (res.result) {
                rawBal = res.result.trim();
              } else if (res.hex && res.hex !== "00000000000000000000000000000000") {
                // Fallback: decode hex string of ASCII decimal digits (e.g. "3130" -> "10")
                let decoded = "";
                for (let i = 0; i < res.hex.length; i += 2) {
                  const ch = String.fromCharCode(parseInt(res.hex.substring(i, i + 2), 16));
                  decoded += ch;
                }
                rawBal = decoded.trim();
              }
              const balLUM = ethers.formatUnits(rawBal, tok.decimals);
              updatedToken.balance = balLUM;
            }
          } catch (e) {
            updatedToken.balance = "0.00";
          }
          return updatedToken;
        }))
        
        // Cache kembali ke localStorage agar tidak perlu request berulang
        localStorage.setItem(`lumina_tokens_${address}`, JSON.stringify(updatedList))
        setImportedTokens(updatedList)
      }
    }
    if (activeTab === 'wallet' || activeTab === 'tokens') {
      loadTokens()
    }
  }, [activeTab, address, rpcUrl])

  const handleVerifyToken = async () => {
    if (!tokenContractAddr.trim()) return
    setVerifyingToken(true)
    setImportTokenError('')
    setTokenMeta(null)
    try {
      const client = new LuminaClient(rpcUrl)
      const meta = await client.getContractMetadata(tokenContractAddr.trim())
      if (meta && meta.metadata) {
        setTokenMeta({
          address: tokenContractAddr.trim(),
          name: meta.metadata.name || "LTS-20 Token",
          symbol: meta.metadata.symbol || "TOK",
          decimals: parseInt(meta.metadata.decimals || "18"),
          logo: meta.metadata.logo || null
        })
      } else {
        throw new Error("Bukan alamat koin LTS-20 valid.")
      }
    } catch (e: any) {
      setImportTokenError(e.message || "Gagal memverifikasi koin.")
    } finally {
      setVerifyingToken(false)
    }
  }

  const handleImportToken = () => {
    if (!tokenMeta) return
    const key = `lumina_tokens_${address}`
    const saved = localStorage.getItem(key)
    const list = saved ? JSON.parse(saved) : []
    
    if (list.some((t: any) => t.address === tokenMeta.address)) {
      setImportTokenError("Koin ini sudah ditambahkan.")
      return
    }

    list.push(tokenMeta)
    localStorage.setItem(key, JSON.stringify(list))
    setImportedTokens([...importedTokens, { ...tokenMeta, balance: "0.00" }])
    
    // Reset Form
    setShowImportToken(false)
    setTokenContractAddr('')
    setTokenMeta(null)
  }

  const handleDeleteToken = (tokenAddr: string) => {
    const key = `lumina_tokens_${address}`
    const saved = localStorage.getItem(key)
    const list = saved ? JSON.parse(saved) : []
    const filtered = list.filter((t: any) => t.address !== tokenAddr)
    localStorage.setItem(key, JSON.stringify(filtered))
    setImportedTokens(importedTokens.filter(t => t.address !== tokenAddr))
  }


  // --- TAB 4: SETTINGS TAB STATES ---
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [keysError, setKeysError] = useState('')
  const [decryptedKeys, setDecryptedKeys] = useState<{ pk: string, mn: string | null } | null>(null)

  const handleExportKeys = () => {
    const saved = localStorage.getItem('lumina_vault')
    if (!saved) return
    try {
      const vault = JSON.parse(saved)
      const decrypted = JSON.parse(atob(vault.encryptedData))
      if (decrypted.pwdCheck !== pwdConfirm) {
        setKeysError("Kata sandi salah!")
        return
      }
      setDecryptedKeys({ pk: decrypted.pk, mn: decrypted.mnemonic })
      setPwdConfirm('')
      setKeysError('')
    } catch (e) {
      setKeysError("Gagal membuka vault.")
    }
  }

  // General Helpers
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSend = async () => {
    if (!toAddress || !amount) return setSendError('Harap lengkapi semua bidang!')
    setIsSending(true)
    setSendError('')
    setSendSuccess('')
    try {
      if (selectedAsset.address === 'native') {
        await sendTransaction(toAddress, amount)
      } else {
        if (!privateKey) throw new Error("Dompet terkunci.")
        const client = new LuminaClient(rpcUrl)
        const wallet = new LuminaWallet(privateKey)
        
        const state = await client.getBalance(address!)
        const nonce = state.next_nonce || 0
        
        const tokenAmount = ethers.parseUnits(amount, selectedAsset.decimals).toString()
        
        const payloadData = `CALL:${selectedAsset.address}:transfer:${toAddress.trim()},${tokenAmount}`
        const dataBytes = Array.from(new TextEncoder().encode(payloadData))
        
        const fee = await client.estimateFee(dataBytes)
        
        const signedTx = wallet.signTransaction(toAddress.trim(), "0", nonce, dataBytes, null, fee)
        
        const res = await client.sendTransaction(signedTx)
        if (res.status === 'success' || res.status === 'submitted') {
          // Sukses
        } else {
          throw new Error(res.message || "Gagal mengirim token.")
        }
      }
      
      setSendSuccess('Transaksi berhasil dikirim!')
      setTimeout(() => {
        setShowSend(false)
        setSendSuccess('')
        setToAddress('')
        setAmount('')
        fetchBalance()
        fetchActivity()
      }, 2000)
    } catch (e: any) {
      setSendError(e.message || 'Transaksi gagal')
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    const refreshData = () => {
      fetchBalance()
      fetchActivity()
    }
    refreshData()
    const interval = setInterval(refreshData, 12000)
    return () => clearInterval(interval)
  }, [fetchBalance, fetchActivity])

  return (
    <div className="h-full flex flex-col bg-[#05070a] overflow-hidden relative">
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[50px] -z-10" />

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-cyber-gradient rounded-md flex items-center justify-center shadow-lg shadow-primary/10">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-white text-xs tracking-tight uppercase">Lumina</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Live Network RPC & Height Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-slate-400">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0 animate-pulse",
              rpcStatus === 'online' ? "bg-[#00ff88]" : "bg-red-500"
            )} />
            <span className="font-mono text-slate-500">
              {networkHeight ? `#${networkHeight.toLocaleString('id-ID')}` : 'Offline'}
            </span>
          </div>

          <div 
            onClick={copyAddress}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
              copied 
              ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]' 
              : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'
            }`}
          >
            <span className="text-[9px] font-mono tracking-wider">
              {address?.slice(0, 6)}...{address?.slice(-6)}
            </span>
            {copied ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : <Copy className="w-2.5 h-2.5" />}
          </div>
        </div>
      </div>

      {/* Scrollable Main Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-20">
        {/* --- TAB 1: WALLET (HOME) --- */}
        {activeTab === 'wallet' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Balance Card */}
            <div className="relative p-5 rounded-xl bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 overflow-hidden">
              <div className="absolute top-3 right-3">
                <button onClick={() => { fetchBalance(); fetchActivity(); }} className="text-slate-600 hover:text-primary transition-colors">
                  <RefreshCcw className="w-3 h-3" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-0.5">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Portfolio Value</p>
                  <div className="flex items-baseline gap-2">
                    <h1 className="text-2xl font-black text-white tracking-tighter">
                      {parseFloat(ethers.formatUnits(balance, 18)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </h1>
                    <span className="text-primary text-[10px] font-bold tracking-widest uppercase">LUM</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setSelectedAsset({ symbol: 'LUM', decimals: 18, balance: ethers.formatUnits(balance, 18), address: 'native' });
                      setShowSend(true);
                    }}
                    className="flex-1 bg-primary text-background py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                  >
                    <Send className="w-3 h-3" strokeWidth={3} /> Send
                  </button>
                  <button 
                    onClick={() => setShowReceive(true)}
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all"
                  >
                    <ArrowDownLeft className="w-3 h-3" strokeWidth={3} /> Receive
                  </button>
                </div>
              </div>
            </div>

            {/* Unified Wallet Portfolio Assets List (MetaMask style) */}
            <div className="space-y-2">
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Coins className="w-2.5 h-2.5 text-primary" /> Aset Portofolio
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {/* 1. Native LUM Card */}
                <div className="flex items-center justify-between p-2.5 bg-white/[0.01] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-white/10 bg-cyber-gradient shadow-md shadow-primary/10">
                      <Wallet className="w-3 h-3 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-200">Lumina Native Coin</p>
                      <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Jaringan Lumina Mainnet</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-black text-white">
                      {parseFloat(ethers.formatUnits(balance, 18)).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </p>
                    <p className="text-[8px] text-primary font-black uppercase tracking-wider font-mono">LUM</p>
                  </div>
                </div>

                {/* 2. Custom Imported LTS-20 Tokens */}
                {importedTokens.map((tok, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-white/[0.01] border border-white/5 rounded-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-white/5 bg-white/5">
                        {tok.logo ? (
                          <img src={tok.logo} alt={tok.symbol} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-black text-[9px] text-primary font-mono">{tok.symbol[0]}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-200 truncate w-32">{tok.name}</p>
                        <p className="text-[8px] text-slate-600 font-mono truncate w-32">{tok.address}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black text-white">
                        {parseFloat(tok.balance).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </p>
                      <p className="text-[8px] text-primary/80 font-bold uppercase tracking-wider font-mono">{tok.symbol}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction List */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <History className="w-2.5 h-2.5 text-primary" /> Riwayat Transaksi
                </h3>
                {/* Visual Activity Filters */}
                <div className="flex bg-white/5 border border-white/10 p-0.5 rounded-lg text-[8px] font-bold">
                  {(['all', 'transfer', 'tokens'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTxFilter(filter)}
                      className={cn(
                        "px-1.5 py-0.5 rounded uppercase tracking-wider transition-colors",
                        txFilter === filter 
                          ? "bg-primary text-background font-black" 
                          : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {filter === 'all' ? 'Semua' : filter === 'transfer' ? 'Transfer' : 'Token'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {filteredHistory.length > 0 ? filteredHistory.map((tx, i) => {
                  const details = getTxDetails(tx)
                  const IconComponent = details.icon

                  return (
                    <div 
                      key={i} 
                      onClick={() => setSelectedTx(tx)}
                      className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-lg hover:bg-white/5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center border",
                          tx.status === 'Pending' ? "bg-amber-500/10 border-amber-500/20" : details.iconBg
                        )}>
                          <IconComponent className={cn(
                            "w-3.5 h-3.5",
                            tx.status === 'Pending' ? "text-amber-500 animate-pulse" : details.iconColor
                          )} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-200">
                            {tx.status === 'Pending' ? 'Pending...' : details.title}
                          </p>
                          <p className="text-[9px] text-slate-600 font-mono truncate w-32">{tx.hash}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-[11px] font-black",
                          tx.status === 'Pending' ? "text-amber-500" : (details.isNegative ? 'text-primary' : 'text-[#00ff88]')
                        )}>
                          {tx.status === 'Pending' ? '' : (details.isNegative ? '-' : '+')}
                          {details.amountText}
                        </p>
                        <p className="text-[8px] font-bold text-slate-700 uppercase tracking-widest">{tx.status || 'Confirmed'}</p>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="py-8 text-center space-y-2 border border-dashed border-white/5 rounded-xl">
                    <p className="text-[9px] text-slate-700 uppercase font-bold tracking-widest">Tidak ada aktivitas</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* --- TAB 2: TOKENS TAB --- */}
        {activeTab === 'tokens' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Coins className="w-3 h-3 text-primary" /> Koin LTS-20 Anda
              </h3>
              <button 
                onClick={() => setShowImportToken(true)}
                className="text-[9px] font-black text-primary hover:brightness-110 uppercase tracking-widest"
              >
                + Import Token
              </button>
            </div>

            <div className="space-y-2">
              {importedTokens.length > 0 ? importedTokens.map((tok, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-white/10 bg-white/5">
                      {tok.logo ? (
                        <img src={tok.logo} alt={tok.symbol} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-xs text-primary font-mono">{tok.symbol[0]}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{tok.name}</h4>
                      <p className="text-[9px] text-slate-500 font-mono tracking-tighter truncate w-32">{tok.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right mr-1">
                      <p className="text-xs font-black text-white">
                        {parseFloat(tok.balance).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </p>
                      <p className="text-[9px] text-primary/80 font-bold uppercase tracking-wider font-mono">{tok.symbol}</p>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedAsset({ symbol: tok.symbol, decimals: tok.decimals, balance: tok.balance, address: tok.address, logo: tok.logo, name: tok.name });
                        setShowSend(true);
                      }}
                      className="px-2 py-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg text-primary transition-all text-[8px] font-black uppercase tracking-wider"
                    >
                      Kirim
                    </button>
                    <button 
                      onClick={() => handleDeleteToken(tok.address)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="py-12 text-center space-y-3 border border-dashed border-white/5 rounded-xl">
                  <p className="text-[9px] text-slate-600 uppercase font-bold tracking-widest">Belum ada Koin LTS-20</p>
                  <p className="text-[9px] text-slate-700 leading-relaxed px-4">
                    Impor alamat koin LTS-20 kustom Anda untuk memantau saldo langsung dari dompet.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}



        {/* --- TAB 4: SETTINGS TAB --- */}
        {activeTab === 'settings' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Settings className="w-3 h-3 text-primary" /> Pengaturan Dompet
            </h3>

            {/* Change RPC */}
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" /> Network RPC Node
              </h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] outline-none font-mono focus:border-primary"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                />
                <button 
                  onClick={() => saveRpcUrl(rpcUrl)}
                  className="bg-primary text-background px-3 rounded-lg text-[9px] font-black uppercase tracking-wider"
                >
                  Simpan
                </button>
              </div>
            </div>

            {/* Export Keys */}
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-primary" /> Ekspor Kunci Vault
              </h4>

              {!decryptedKeys ? (
                <div className="space-y-2">
                  <input 
                    type="password" 
                    placeholder="Masukkan Kata Sandi" 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] outline-none text-center"
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                  />
                  {keysError && <p className="text-[9px] text-red-400 font-bold uppercase text-center">{keysError}</p>}
                  <button 
                    onClick={handleExportKeys}
                    className="w-full bg-white/5 border border-white/10 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10"
                  >
                    Buka Ekspor Kunci
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-2 bg-red-500/5 border border-red-500/10 rounded-lg flex items-center gap-2 text-red-400">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <p className="text-[8px] leading-relaxed font-bold uppercase">
                      JANGAN PERNAH MENUNJUKKAN KUNCI PRIVAT / MNEMONIC ANDA KEPADA SIAPAPUN!
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-[8px] text-slate-600 font-bold uppercase tracking-wider">Private Key (Hex)</p>
                    <div className="p-2.5 bg-black/50 rounded-lg border border-white/5 font-mono text-[9px] text-slate-300 break-all select-all">
                      {decryptedKeys.pk}
                    </div>
                  </div>

                  {decryptedKeys.mn && (
                    <div className="space-y-1">
                      <p className="text-[8px] text-slate-600 font-bold uppercase tracking-wider">Mnemonic Seed Phrase</p>
                      <div className="p-2.5 bg-black/50 rounded-lg border border-white/5 font-mono text-[9px] text-slate-300 break-all select-all">
                        {decryptedKeys.mn}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setDecryptedKeys(null)}
                    className="w-full bg-white/5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    Sembunyikan Kunci
                  </button>
                </div>
              )}
            </div>

            {/* Logout/Reset */}
            <button 
              onClick={logout}
              className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 py-3 rounded-lg text-[10px] font-black uppercase tracking-wider"
            >
              Reset Dompet / Log Keluar
            </button>
          </motion.div>
        )}
      </div>

      {/* --- BOTTOM NAVIGATION BAR --- */}
      <div className="absolute bottom-0 left-0 right-0 h-16 border-t border-white/5 bg-background/80 backdrop-blur-xl flex items-center justify-around px-4 z-20">
        <button 
          onClick={() => setActiveTab('wallet')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors text-[9px] font-bold uppercase tracking-wider",
            activeTab === 'wallet' ? "text-primary" : "text-slate-600 hover:text-slate-400"
          )}
        >
          <Wallet className="w-4 h-4" /> Wallet
        </button>

        <button 
          onClick={() => setActiveTab('tokens')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors text-[9px] font-bold uppercase tracking-wider",
            activeTab === 'tokens' ? "text-primary" : "text-slate-600 hover:text-slate-400"
          )}
        >
          <Coins className="w-4 h-4" /> Tokens
        </button>



        <button 
          onClick={() => setActiveTab('settings')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors text-[9px] font-bold uppercase tracking-wider",
            activeTab === 'settings' ? "text-primary" : "text-slate-600 hover:text-slate-400"
          )}
        >
          <Settings className="w-4 h-4" /> Settings
        </button>
      </div>

      {/* --- MODALS (SHARED) --- */}
      <AnimatePresence>
        {/* Receive Modal */}
        {showReceive && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReceive(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40" />
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="absolute bottom-0 left-0 right-0 bg-[#0a0d14] border-t border-white/10 rounded-t-xl p-6 z-50 shadow-2xl">
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-6" />
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-white italic">Receive LUM</h2>
                <button onClick={() => setShowReceive(false)} className="p-1 hover:bg-white/5 rounded-lg text-slate-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-col items-center space-y-6">
                <div className="p-4 bg-white rounded-lg"><QRCodeSVG value={address || ""} size={140} level="H" /></div>
                <div className="w-full space-y-3">
                  <p className="text-[9px] text-center text-slate-500 font-bold uppercase">Public Address</p>
                  <div onClick={copyAddress} className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition-all cursor-pointer ${copied ? 'bg-[#00ff88]/5 border-[#00ff88]/20' : 'bg-white/5 border-white/10'}`}>
                    <span className="text-[10px] font-mono text-center break-all text-slate-300">{address}</span>
                    <div className={`flex items-center gap-2 mt-1 text-[9px] font-bold uppercase ${copied ? 'text-[#00ff88]' : 'text-primary'}`}>
                      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Address</>}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {/* Send Modal */}
        {showSend && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSend(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40" />
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="absolute bottom-0 left-0 right-0 bg-[#0a0d14] border-t border-white/10 rounded-t-xl p-6 z-50 shadow-2xl">
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-6" />
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-white italic">Send Assets</h2>
                <button onClick={() => setShowSend(false)} className="p-1 hover:bg-white/5 rounded-lg text-slate-500"><X className="w-4 h-4" /></button>
              </div>
              
              <div className="space-y-4">
                {/* Premium Custom Asset Selector Dropdown */}
                <div className="space-y-2 relative">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Pilih Aset Kirim</label>
                  
                  {/* Trigger Button */}
                  <div 
                    onClick={() => setIsOpenAssetSelect(!isOpenAssetSelect)}
                    className="w-full bg-white/5 border border-white/10 hover:border-primary/50 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Asset Icon */}
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-white/10 overflow-hidden",
                        selectedAsset.address === 'native' ? "bg-cyber-gradient" : "bg-white/5"
                      )}>
                        {selectedAsset.address === 'native' ? (
                          <Wallet className="w-3.5 h-3.5 text-white" />
                        ) : selectedAsset.logo ? (
                          <img src={selectedAsset.logo} alt={selectedAsset.symbol} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span className="font-black text-[9px] text-primary font-mono">{selectedAsset.symbol[0]}</span>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-[11px] font-bold text-white tracking-wide leading-tight">
                          {selectedAsset.address === 'native' ? 'Lumina Native Coin' : selectedAsset.name || 'Custom Token'}
                        </p>
                        <p className="text-[8px] text-primary/80 font-bold uppercase tracking-wider font-mono">{selectedAsset.symbol}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold font-mono">
                        {parseFloat(selectedAsset.balance).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                      </span>
                      <ArrowDownLeft className={cn("w-3.5 h-3.5 text-slate-500 transition-transform duration-200", isOpenAssetSelect && "rotate-180")} />
                    </div>
                  </div>

                  {/* Dropdown Options List */}
                  <AnimatePresence>
                    {isOpenAssetSelect && (
                      <>
                        {/* Overlay to close */}
                        <div className="fixed inset-0 z-30" onClick={() => setIsOpenAssetSelect(false)} />
                        
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute left-0 right-0 mt-1 bg-[#0f131c] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-40 max-h-48 overflow-y-auto custom-scrollbar"
                        >
                          {/* Option 1: Native LUM */}
                          <div 
                            onClick={() => {
                              setSelectedAsset({ symbol: 'LUM', decimals: 18, balance: ethers.formatUnits(balance, 18), address: 'native' });
                              setIsOpenAssetSelect(false);
                            }}
                            className={cn(
                              "p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-white/5 border-b border-white/5",
                              selectedAsset.address === 'native' && "bg-white/[0.02]"
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-white/10 bg-cyber-gradient">
                                <Wallet className="w-3.5 h-3.5 text-white" />
                              </div>
                              <div className="text-left">
                                <p className="text-[11px] font-bold text-white">Lumina Native Coin</p>
                                <p className="text-[8px] text-slate-500 font-mono">LUM</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-right">
                              <div>
                                <p className="text-[10px] font-black text-white">
                                  {parseFloat(ethers.formatUnits(balance, 18)).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                                </p>
                                <p className="text-[7px] text-primary uppercase font-bold">LUM</p>
                              </div>
                              {selectedAsset.address === 'native' && <Check className="w-3.5 h-3.5 text-[#00ff88]" strokeWidth={3} />}
                            </div>
                          </div>

                          {/* Options 2+: LTS-20 Tokens */}
                          {importedTokens.map((tok, idx) => (
                            <div 
                              key={idx}
                              onClick={() => {
                                setSelectedAsset({ symbol: tok.symbol, decimals: tok.decimals, balance: tok.balance, address: tok.address, logo: tok.logo, name: tok.name });
                                setIsOpenAssetSelect(false);
                              }}
                              className={cn(
                                "p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-white/5 border-b border-white/5",
                                selectedAsset.address === tok.address && "bg-white/[0.02]"
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-white/10 bg-white/5">
                                  {tok.logo ? (
                                    <img src={tok.logo} alt={tok.symbol} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-black text-[9px] text-primary font-mono">{tok.symbol[0]}</span>
                                  )}
                                </div>
                                <div className="text-left">
                                  <p className="text-[11px] font-bold text-white truncate w-32">{tok.name}</p>
                                  <p className="text-[8px] text-slate-500 font-mono truncate w-32">{tok.address}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-right">
                                <div>
                                  <p className="text-[10px] font-black text-white">
                                    {parseFloat(tok.balance).toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                                  </p>
                                  <p className="text-[7px] text-primary/80 uppercase font-bold">{tok.symbol}</p>
                                </div>
                                {selectedAsset.address === tok.address && <Check className="w-3.5 h-3.5 text-[#00ff88]" strokeWidth={3} />}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-left block">Recipient Address</label>
                  <input 
                    type="text" 
                    placeholder="lumina1..." 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs outline-none focus:border-primary transition-all font-mono"
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Jumlah Kirim ({selectedAsset.symbol})</label>
                    <span className="text-[9px] text-slate-600 font-bold">Max: {parseFloat(selectedAsset.balance).toFixed(4)} {selectedAsset.symbol}</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="0.00" 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs outline-none focus:border-primary transition-all font-bold"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <button onClick={() => setAmount(selectedAsset.balance)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary hover:brightness-110">MAX</button>
                  </div>
                </div>

                {sendError && <p className="text-[9px] text-red-400 font-bold uppercase text-center">{sendError}</p>}
                {sendSuccess && <p className="text-[9px] text-[#00ff88] font-bold uppercase text-center">{sendSuccess}</p>}

                <button 
                  onClick={handleSend}
                  disabled={isSending || !!sendSuccess}
                  className="w-full bg-primary text-background py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Review & Send</>}
                </button>
              </div>
            </motion.div>
          </>
        )}

        {/* Import Token Modal */}
        {showImportToken && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowImportToken(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40" />
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="absolute bottom-0 left-0 right-0 bg-[#0a0d14] border-t border-white/10 rounded-t-xl p-6 z-50 shadow-2xl">
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-6" />
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-white italic">Import Custom Token</h2>
                <button onClick={() => setShowImportToken(false)} className="p-1 hover:bg-white/5 rounded-lg text-slate-500"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Alamat Kontrak LTS-20</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="lumina1..." 
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2.5 text-[10px] font-mono outline-none focus:border-primary transition-all"
                      value={tokenContractAddr}
                      onChange={(e) => setTokenContractAddr(e.target.value)}
                    />
                    <button 
                      onClick={handleVerifyToken}
                      disabled={verifyingToken}
                      className="bg-primary text-background px-3 rounded-lg text-[9px] font-black uppercase tracking-wider disabled:opacity-50"
                    >
                      {verifyingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verifikasi"}
                    </button>
                  </div>
                </div>

                {importTokenError && <p className="text-[9px] text-red-400 font-bold uppercase text-center">{importTokenError}</p>}

                {tokenMeta && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                    {tokenMeta.logo && (
                      <div className="flex justify-center py-2">
                        <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full overflow-hidden flex items-center justify-center">
                          <img src={tokenMeta.logo} alt={tokenMeta.symbol} className="w-full h-full object-cover" />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Nama Koin</span>
                      <span className="text-[10px] text-white font-bold">{tokenMeta.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Simbol Koin</span>
                      <span className="text-[10px] text-primary font-mono font-bold uppercase">{tokenMeta.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Decimals</span>
                      <span className="text-[10px] text-white font-mono">{tokenMeta.decimals}</span>
                    </div>
                    
                    <button 
                      onClick={handleImportToken}
                      className="w-full bg-[#00ff88] text-background py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all mt-2"
                    >
                      Tambah Koin Sekarang
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}

        {/* Transaction Detail Modal */}
        {selectedTx && (() => {
          const parsed = parseTxData(selectedTx);
          const details = getTxDetails(selectedTx);
          
          return (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTx(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40" />
              <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="absolute bottom-0 left-0 right-0 bg-[#0a0d14] border-t border-white/10 rounded-t-xl p-6 z-50 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
                <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-6" />
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-sm font-black uppercase tracking-widest text-white italic">Detail Transaksi</h2>
                  <button onClick={() => setSelectedTx(null)} className="p-1 hover:bg-white/5 rounded-lg text-slate-500"><X className="w-4 h-4" /></button>
                </div>
                
                <div className="space-y-4 font-sans text-left">
                  {/* Status & Method Badges */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex gap-2">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                        selectedTx.status === 'Pending' ? "bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse" : "bg-[#00ff88]/10 border-[#00ff88]/20 text-[#00ff88]"
                      )}>
                        {selectedTx.status || 'Confirmed'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-primary/10 border-primary/20 text-primary">
                        {details.method}
                      </span>
                    </div>
                    {selectedTx.timestamp && (
                      <span className="text-[9px] font-bold text-slate-500">
                        {new Date(selectedTx.timestamp).toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>

                  {/* Amount Display */}
                  <div className="text-center py-4 bg-white/[0.01] border border-white/5 rounded-xl">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Nilai Transaksi</p>
                    <h1 className={cn(
                      "text-xl font-black mt-1",
                      selectedTx.status === 'Pending' ? "text-amber-500" : (details.isNegative ? "text-primary" : "text-[#00ff88]")
                    )}>
                      {selectedTx.status === 'Pending' ? '' : (details.isNegative ? '-' : '+')}
                      {details.amountText}
                    </h1>
                  </div>

                  {/* Sender/Recipient Detail */}
                  <div className="space-y-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Pengirim (From)</span>
                      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2 font-mono text-[9px] text-slate-300">
                        <span className="truncate w-64">{selectedTx.from}</span>
                        <button onClick={() => { navigator.clipboard.writeText(selectedTx.from); alert('Alamat pengirim disalin!'); }} className="text-primary hover:brightness-110 ml-2"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Penerima (To)</span>
                      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2 font-mono text-[9px] text-slate-300">
                        <span className="truncate w-64">
                          {details.recipient || selectedTx.to}
                        </span>
                        <button onClick={() => { navigator.clipboard.writeText(details.recipient || selectedTx.to); alert('Alamat penerima disalin!'); }} className="text-primary hover:brightness-110 ml-2"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    {/* Staking-Specific details */}
                    {parsed?.type === 'STAKING' && (
                      <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 space-y-2">
                        <p className="text-[9px] font-black text-purple-400 uppercase tracking-wider">Informasi Staking</p>
                        <div className="space-y-1 font-mono text-[9px]">
                          <p className="text-slate-400 break-all"><span className="font-bold text-purple-400">Node ID:</span> {parsed.nodeId}</p>
                          {parsed.blsKey && (
                            <p className="text-slate-400 break-all"><span className="font-bold text-purple-400">BLS Key:</span> {parsed.blsKey}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Smart Contract Call specific details */}
                    {parsed?.type === 'CONTRACT_CALL' && (
                      <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 space-y-2">
                        <p className="text-[9px] font-black text-cyan-400 uppercase tracking-wider">Informasi Panggilan Kontrak</p>
                        <div className="space-y-1 font-mono text-[9px] text-slate-400">
                          <p className="break-all"><span className="font-bold text-cyan-400">Alamat Kontrak:</span> {parsed.contract}</p>
                          <p><span className="font-bold text-cyan-400">Nama Metode:</span> {parsed.method}</p>
                          {parsed.args && parsed.args.length > 0 && (
                            <div className="mt-1">
                              <p className="font-bold text-cyan-400">Argumen Fungsi:</p>
                              <ul className="list-disc list-inside pl-1 text-[8px] space-y-0.5">
                                {parsed.args.map((arg: string, aIdx: number) => (
                                  <li key={aIdx} className="truncate max-w-full">{arg}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Hash */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Hash Transaksi</span>
                      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2 font-mono text-[9px] text-slate-300">
                        <span className="truncate w-64">{selectedTx.hash}</span>
                        <button onClick={() => { navigator.clipboard.writeText(selectedTx.hash); alert('Hash transaksi disalin!'); }} className="text-primary hover:brightness-110 ml-2"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Nonce</span>
                        <p className="text-[10px] font-black text-white font-mono">#{selectedTx.nonce}</p>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Gas Fee</span>
                        <p className="text-[10px] font-black text-white font-mono">
                          {parseFloat(ethers.formatUnits(selectedTx.fee || "0", 18)).toFixed(8)} LUM
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* View on Explorer Action */}
                  <a 
                    href={`https://explorer.bariscode.my.id/tx/${selectedTx.hash}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all mt-4"
                  >
                    <Globe className="w-3.5 h-3.5 text-primary" /> Tinjau di Explorer
                  </a>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>
    </div>
  )
}
