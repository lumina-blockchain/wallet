import { useEffect } from 'react'
import { useWalletStore } from './store/useWalletStore'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import DappPrompt from './components/DappPrompt'
import { Loader2 } from 'lucide-react'

function App() {
  const { isLocked, isLoading, initialize, hasWallet, isVerified, pendingDappRequest } = useWalletStore()

  useEffect(() => {
    initialize()
  }, [])

  if (isLoading) {
    return (
      <div className="w-[360px] h-[580px] bg-background flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-primary/20 rounded-full" />
          <Loader2 className="w-12 h-12 text-primary animate-spin absolute inset-0" />
        </div>
        <p className="text-xs text-primary/60 font-mono tracking-widest animate-pulse">VAULT_INITIALIZING</p>
      </div>
    )
  }

  // Alur Logika:
  // 1. Belum punya wallet? -> Onboarding (Setup)
  // 2. Sudah punya tapi terkunci? -> Onboarding (Unlock Screen)
  // 3. Sudah terbuka tapi belum verifikasi backup? -> Onboarding (Verify Step)
  // 4. Ada permintaan dApp yang tertunda? -> Tampilkan DappPrompt
  // 5. Sudah terbuka & sudah verifikasi -> Dashboard
  
  const showDashboard = hasWallet && !isLocked && isVerified

  return (
    <div className="w-[360px] h-[580px] bg-background relative select-none">
      {pendingDappRequest && hasWallet && !isLocked ? (
        <DappPrompt />
      ) : showDashboard ? (
        <Dashboard />
      ) : (
        <Onboarding />
      )}
    </div>
  )
}

export default App
