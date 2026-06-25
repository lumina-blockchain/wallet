import { create } from 'zustand'
import { ethers } from 'ethers'
import { LuminaWallet, LuminaClient, LuminaUtils } from 'lumina-blockchain-sdk'

interface WalletState {
  address: string | null
  privateKey: string | null
  mnemonic: string | null
  balance: string
  isLocked: boolean
  isLoading: boolean
  hasWallet: boolean
  isVerified: boolean
  history: any[]
  
  // dApp Integration States
  pendingDappRequest: any | null
  
  initialize: () => Promise<void>
  createWallet: (password: string) => Promise<string>
  importWallet: (mnemonicOrKey: string, password: string) => Promise<void>
  verifyWallet: () => Promise<void>
  fetchBalance: () => Promise<void>
  fetchActivity: () => Promise<void>
  unlock: (password: string) => Promise<boolean>
  sendTransaction: (to: string, amount: string) => Promise<string>
  lock: () => void
  setLocked: (locked: boolean) => void
  logout: () => void
  
  // dApp Actions
  fetchPendingDappRequest: () => Promise<void>
  approveDappRequest: (reqId: string, result: any) => Promise<void>
  rejectDappRequest: (reqId: string, reason?: string) => Promise<void>
}

const getRpcUrl = () => {
  try {
    return localStorage.getItem('bigchain_rpc_url') || "https://rpc1.bariscode.my.id";
  } catch (e) {
    return "https://rpc1.bariscode.my.id";
  }
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  mnemonic: null,
  privateKey: null,
  balance: "0",
  isLocked: true,
  isLoading: true,
  hasWallet: false,
  isVerified: false,
  history: [],
  pendingDappRequest: null,

  initialize: async () => {
    try {
      let saved = localStorage.getItem('bigchain_vault')

      // Bidirectional storage synchronization (non-blocking callback style)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.get(['bigchain_vault'], (res: any) => {
            if (res && res.bigchain_vault) {
              if (!saved) {
                saved = JSON.stringify(res.bigchain_vault)
                localStorage.setItem('bigchain_vault', saved)
                // If loaded, update zustand state immediately
                set({ 
                  address: res.bigchain_vault.address, 
                  hasWallet: true, 
                  isVerified: res.bigchain_vault.isVerified ?? true 
                })
              }
            } else if (saved) {
              const data = JSON.parse(saved)
              chrome.storage.local.set({ bigchain_vault: data })
            }
          })
        } catch (err) {
          console.error("Storage Sync Error:", err)
        }
      }

      if (saved) {
        const data = JSON.parse(saved)
        const lastActive = parseInt(localStorage.getItem('bigchain_last_active') || "0")
        const now = Date.now()
        if (now - lastActive < 60000) {
          try {
            const decrypted = JSON.parse(atob(data.encryptedData))
            set({ 
              address: data.address,
              privateKey: decrypted.pk, 
              mnemonic: decrypted.mnemonic,
              hasWallet: true,
              isVerified: data.isVerified ?? true,
              isLocked: false,
              isLoading: false 
            })
            await get().fetchPendingDappRequest()
            return
          } catch (e) {}
        }
        set({ address: data.address, hasWallet: true, isVerified: data.isVerified ?? true, isLocked: true, isLoading: false })
      } else {
        set({ hasWallet: false, isLoading: false })
      }
    } catch (e) {
      console.error("Initialize error:", e)
      set({ isLoading: false })
    }
  },

  fetchPendingDappRequest: async () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['pendingDappRequest'], (res: any) => {
        if (res.pendingDappRequest) {
          set({ pendingDappRequest: res.pendingDappRequest })
        } else {
          set({ pendingDappRequest: null })
        }
      })
    }
  },

  approveDappRequest: async (reqId: string, result: any) => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'BIGCHAIN_APPROVE_REQUEST',
        payload: { reqId, result }
      })
    }
    set({ pendingDappRequest: null })
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['pendingDappRequest'])
    }
  },

  rejectDappRequest: async (reqId: string, reason: string = "User rejected request") => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'BIGCHAIN_REJECT_REQUEST',
        payload: { reqId, reason }
      })
    }
    set({ pendingDappRequest: null })
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['pendingDappRequest'])
    }
  },

  fetchActivity: async () => {
    const { address } = get()
    if (!address) return
    try {
      const client = new LuminaClient(getRpcUrl())
      
      // 1. Fetch Confirmed Txs via SDK
      const confData = await client.getTransactionsByAddress(address, 0, 10)
      const confirmedTxs = (confData.transactions || []).map((tx: any) => ({ ...tx, status: 'Confirmed' }))

      // 2. Fetch Pending Txs (Mempool) via SDK
      const pendingTxs = await client.getMempoolByAddress(address)
      
      // 3. Merge & Deduplicate
      const confirmedHashes = new Set(confirmedTxs.map((t: any) => t.hash))
      const uniquePending = pendingTxs.filter((t: any) => !confirmedHashes.has(t.hash))

      const allTxs = [...uniquePending, ...confirmedTxs].sort((a, b) => b.timestamp - a.timestamp)
      set({ history: allTxs })
    } catch (e) { console.error("Fetch Activity Error:", e) }
  },

  fetchBalance: async () => {
    const { address } = get()
    if (!address) return
    try {
      const client = new LuminaClient(getRpcUrl())
      const data = await client.getBalance(address)
      set({ balance: data.balance.toString() })
    } catch (e) { console.error("Fetch Balance Error:", e) }
  },

  createWallet: async (password: string) => {
    const ethWallet = ethers.Wallet.createRandom()
    const mnemonic = ethWallet.mnemonic?.phrase || ""
    const pk = ethWallet.privateKey
    
    // SDK: Derive address & setup wallet
    const wallet = new LuminaWallet(pk)
    const luminaAddr = wallet.getAddress()
    
    const vault = {
      address: luminaAddr,
      isVerified: false,
      encryptedData: btoa(JSON.stringify({ pk, mnemonic, pwdCheck: password }))
    }
    localStorage.setItem('bigchain_vault', JSON.stringify(vault))
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ bigchain_vault: vault })
    }
    set({ address: luminaAddr, mnemonic, privateKey: pk, hasWallet: true, isVerified: false, isLocked: false })
    return mnemonic
  },

  importWallet: async (mnemonicOrKey: string, password: string) => {
    try {
      let wallet: any
      const cleanInput = mnemonicOrKey.trim()
      
      if (cleanInput.split(" ").length >= 12) {
        wallet = LuminaWallet.fromMnemonic(cleanInput)
      } else {
        wallet = new LuminaWallet(cleanInput)
      }
      
      const pk = wallet.privateKey
      const luminaAddr = wallet.getAddress()
      
      const vault = {
        address: luminaAddr,
        isVerified: true,
        encryptedData: btoa(JSON.stringify({ pk, mnemonic: cleanInput.split(" ").length >= 12 ? cleanInput : null, pwdCheck: password }))
      }
      localStorage.setItem('bigchain_vault', JSON.stringify(vault))
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ bigchain_vault: vault })
      }
      set({ address: luminaAddr, privateKey: pk, hasWallet: true, isVerified: true, isLocked: false })
    } catch (e) { throw new Error("Invalid Mnemonic or Private Key") }
  },

  verifyWallet: async () => {
    const saved = localStorage.getItem('bigchain_vault')
    if (saved) {
      const data = JSON.parse(saved)
      data.isVerified = true
      localStorage.setItem('bigchain_vault', JSON.stringify(data))
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ bigchain_vault: data })
      }
      set({ isVerified: true })
    }
  },

  unlock: async (password: string) => {
    const saved = localStorage.getItem('bigchain_vault')
    if (!saved) return false
    try {
      const vault = JSON.parse(saved)
      const decrypted = JSON.parse(atob(vault.encryptedData))
      if (decrypted.pwdCheck !== password) return false
      localStorage.setItem('bigchain_last_active', Date.now().toString())
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ bigchain_vault: vault })
      }
      set({ address: vault.address, privateKey: decrypted.pk, mnemonic: decrypted.mnemonic, isVerified: vault.isVerified ?? true, isLocked: false })
      await get().fetchPendingDappRequest()
      return true
    } catch (e) { return false }
  },

  sendTransaction: async (toAddress: string, amountLMN: string) => {
    const { privateKey, address: fromAddr } = get()
    if (!privateKey || !fromAddr) throw new Error("Wallet locked")
    
    try {
      const client = new LuminaClient(getRpcUrl())
      const wallet = new LuminaWallet(privateKey)
      
      const amountUnits = LuminaUtils.toUnits(amountLMN).toString()
      
      // SDK: Natively sign and send with automatic fee estimation and wait
      const result = await client.sendTransaction(wallet, toAddress, amountUnits)
      
      if (result.status === 'success' || result.status === 'submitted') {
        return result.hash || "Submitted"
      }
      throw new Error(result.message || "Failed to submit transaction")
    } catch (e: any) { throw new Error(e.message || "Tx Error") }
  },

  lock: () => set({ isLocked: true, privateKey: null, mnemonic: null }),
  setLocked: (locked: boolean) => set({ isLocked: locked }),
  logout: () => {
    localStorage.clear()
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.clear()
    }
    set({ address: null, privateKey: null, mnemonic: null, hasWallet: false, isVerified: false, history: [], balance: "0" })
  }
}))

