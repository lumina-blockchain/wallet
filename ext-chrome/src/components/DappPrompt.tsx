import { useState, useEffect } from 'react'
import { useWalletStore } from '../store/useWalletStore'
import { Shield, X, Check, Loader2, AlertTriangle, FileCode } from 'lucide-react'
import { motion } from 'framer-motion'
import { LuminaWallet, LuminaClient, LuminaUtils } from 'lumina-blockchain-sdk'

const client = new Proxy({} as any, {
  get: (_target, prop) => {
    let url = "https://rpc1.bariscode.my.id";
    try {
      url = localStorage.getItem('bigchain_rpc_url') || "https://rpc1.bariscode.my.id";
    } catch (e) {}
    const actualClient = new LuminaClient(url);
    const value = Reflect.get(actualClient, prop);
    return typeof value === 'function' ? value.bind(actualClient) : value;
  }
});

export default function DappPrompt() {
  const { pendingDappRequest, privateKey, address, approveDappRequest, rejectDappRequest } = useWalletStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fee, setFee] = useState('0')

  const req = pendingDappRequest
  if (!req) return null

  const { id, method, origin, params } = req

  // Fetch estimated fee for transactions
  useEffect(() => {
    const fetchFee = async () => {
      if (method === 'big_sendTransaction') {
        try {
          const data = params.data || [];
          const estFee = await client.estimateFee(data);
          setFee(LuminaUtils.toLumina(estFee));
        } catch (e) {}
      }
    };
    fetchFee();
  }, [method, params]);

  const handleApprove = async () => {
    if (!privateKey || !address) {
      setError("Dompet terkunci atau belum siap.");
      return;
    }

    setLoading(true)
    setError('')
    try {
      const wallet = new LuminaWallet(privateKey)

      switch (method) {
        case 'big_requestAccounts': {
          // Save origin to connected list in chrome storage
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const saved = await chrome.storage.local.get(['connectedOrigins'])
            const list = saved.connectedOrigins || []
            if (!list.includes(origin)) {
              list.push(origin)
              await chrome.storage.local.set({ connectedOrigins: list })
            }
          }
          await approveDappRequest(id, {
            value: [address],
            connectedOrigin: origin
          });
          break;
        }

        case 'big_sendTransaction': {
          const { to, amount, data } = params
          // Standardize amount: if provided as LUM string or units
          let amountUnits = amount;
          if (typeof amount === 'string' && !amount.includes('00000000000')) {
            amountUnits = LuminaUtils.toUnits(amount).toString();
          }

          // Get nonce
          const senderState = await client.getBalance(address);
          const txNonce = senderState.next_nonce || 0;

          // Estimate fee with actual data payload
          const txDataPayload = data || [];
          const txFee = await client.estimateFee(txDataPayload);
          
          // Sign transaction directly with data payload included
          const signedTx = wallet.signTransaction(to, amountUnits, txNonce, txDataPayload, null, txFee);

          // Submit the signed transaction to network
          const txRes = await client.sendTransaction(signedTx);

          if (txRes.status === 'success' || txRes.status === 'submitted') {
            await approveDappRequest(id, { value: txRes.hash });
          } else {
            throw new Error(txRes.message || "Failed to submit transaction");
          }
          break;
        }

        case 'lumina_signTransaction': {
          const { to, amount, data, nonce } = params
          let amountUnits = amount;
          if (typeof amount === 'string' && !amount.includes('00000000000')) {
            amountUnits = LuminaUtils.toUnits(amount).toString();
          }

          let txNonce = nonce;
          if (txNonce === null || txNonce === undefined) {
            const state = await client.getBalance(address);
            txNonce = state.next_nonce || 0;
          }

          const txFee = await client.estimateFee(data || []);
          const signed = wallet.signTransaction(to, amountUnits, txNonce, data || [], null, txFee);
          await approveDappRequest(id, { value: signed });
          break;
        }

        case 'lumina_signAsFeePayer': {
          // Sponsor signing
          const signedTx = params.signedTx;
          const signed = wallet.signAsFeePayer(signedTx);
          await approveDappRequest(id, { value: signed });
          break;
        }

        default:
          throw new Error("Method tidak didukung.");
      }

      // Close popup window if it is standalone
      setTimeout(() => {
        if (window.close) window.close();
      }, 500);

    } catch (e: any) {
      setError(e.message || "Gagal menyetujui permintaan.");
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await rejectDappRequest(id, "User rejected request")
      setTimeout(() => {
        if (window.close) window.close();
      }, 500);
    } catch (e) {}
    setLoading(false)
  }

  return (
    <div className="absolute inset-0 bg-[#05070a] z-50 flex flex-col justify-between p-6">
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[60px] -z-10" />

      {/* Header Info */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Shield className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Lumina Secure Portal</span>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Aplikasi (dApp)</p>
          <h2 className="text-xs font-black text-white font-mono truncate">{origin}</h2>
        </div>
      </div>

      {/* Dynamic Content based on Method */}
      <div className="flex-1 flex flex-col justify-center py-6 space-y-6">
        {method === 'lumina_requestAccounts' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-center">
            <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto text-primary shadow-lg shadow-primary/5">
              <Shield className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Hubungkan Dompet?</h3>
              <p className="text-[10px] text-slate-500 leading-relaxed px-4">
                Situs ini meminta akses untuk membaca alamat dompet publik Anda. dApp TIDAK dapat mengakses dana Anda tanpa persetujuan Anda.
              </p>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-left">
              <p className="text-[8px] text-slate-500 uppercase tracking-widest font-black">Alamat Akun Anda</p>
              <p className="text-[10px] font-mono text-slate-300 break-all">{address}</p>
            </div>
          </motion.div>
        )}

        {(method === 'lumina_sendTransaction' || method === 'lumina_signTransaction') && (() => {
          // Parse CALL: payload to detect token transfers
          let callInfo: { contract: string; method: string; recipient: string; tokenAmount: string } | null = null;
          if (params.data && params.data.length > 0) {
            try {
              const decoded = new TextDecoder().decode(new Uint8Array(params.data));
              // Format: CALL:<contract>:<method>:<args>
              if (decoded.startsWith('CALL:')) {
                const parts = decoded.split(':');
                if (parts.length >= 4 && parts[2] === 'transfer') {
                  const args = parts[3].split(',');
                  const rawAmount = args[1] || '0';
                  // Convert from raw units (18 decimals) to readable
                  const readable = LuminaUtils.toLumina(rawAmount);
                  callInfo = {
                    contract: parts[1],
                    method: parts[2],
                    recipient: args[0],
                    tokenAmount: readable
                  };
                }
              }
            } catch (_e) {}
          }

          const isTokenTransfer = callInfo !== null;

          return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center gap-2 justify-center italic font-black uppercase text-xs text-white">
              <span>{isTokenTransfer ? 'Transfer Token LTS-20' : 'Minta Transfer Dana'}</span>
              <FileCode className="w-4 h-4 text-primary" />
            </div>

            <div className="space-y-3">
              {isTokenTransfer && callInfo ? (
                <>
                  {/* Token Contract */}
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-[8px] text-slate-500 uppercase tracking-widest font-black">Kontrak Token</p>
                    <p className="text-[10px] font-mono text-slate-300 break-all">{callInfo.contract}</p>
                  </div>

                  {/* Token Recipient */}
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-[8px] text-slate-500 uppercase tracking-widest font-black">Penerima Token</p>
                    <p className="text-[10px] font-mono text-slate-300 break-all">{callInfo.recipient}</p>
                  </div>

                  {/* Token Amount */}
                  <div className="p-3 bg-secondary/5 border border-secondary/20 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="text-[8px] text-secondary uppercase tracking-widest font-black">Jumlah Token</p>
                      <p className="text-base font-black text-white">{callInfo.tokenAmount} <span className="text-[10px] text-secondary">TOKEN</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] text-slate-600 uppercase tracking-widest font-black">Est. Fee</p>
                      <p className="text-xs font-bold text-slate-400">{fee} LUM</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Native Transfer: To Address */}
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-[8px] text-slate-500 uppercase tracking-widest font-black">Penerima (To Address)</p>
                    <p className="text-[10px] font-mono text-slate-300 break-all">{params.to}</p>
                  </div>

                  {/* Native Transfer: Amount */}
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="text-[8px] text-slate-500 uppercase tracking-widest font-black">Jumlah Kirim</p>
                      <p className="text-base font-black text-white">{LuminaUtils.toLumina(params.amount)} <span className="text-[10px] text-primary">LUM</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] text-slate-600 uppercase tracking-widest font-black">Est. Fee</p>
                      <p className="text-xs font-bold text-slate-400">{fee} LUM</p>
                    </div>
                  </div>
                </>
              )}

              {/* Raw Data Payload (show for all, collapsed for token) */}
              {params.data && params.data.length > 0 && !isTokenTransfer && (
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                  <p className="text-[8px] text-slate-500 uppercase tracking-widest font-black">Data Payload</p>
                  <p className="text-[9px] font-mono text-slate-400 break-all truncate max-h-12 overflow-y-auto">
                    {Array.isArray(params.data) ? new TextDecoder().decode(new Uint8Array(params.data)) : params.data}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
          );
        })()}

        {method === 'lumina_signAsFeePayer' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-center">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/5 animate-pulse">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Sponsori Transaksi?</h3>
              <p className="text-[10px] text-slate-500 leading-relaxed px-4">
                Situs ini meminta Anda menandatangani transaksi ini sebagai **Fee Payer**. Anda akan menanggung biaya gas transaksi ini!
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Error & Action Buttons */}
      <div className="space-y-4">
        {error && <p className="text-[9px] text-red-400 font-bold uppercase text-center">{error}</p>}

        <div className="flex gap-3">
          <button 
            disabled={loading}
            onClick={handleReject}
            className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" strokeWidth={3} /> Tolak
          </button>
          <button 
            disabled={loading}
            onClick={handleApprove}
            className="flex-1 bg-primary text-background py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Setujui</>}
          </button>
        </div>
      </div>
    </div>
  )
}

