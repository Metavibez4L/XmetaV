import { PaymentsDashboard } from "@/components/PaymentsDashboard";
import { Wallet, Shield, Zap } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5" style={{ color: '#00f0ff' }} />
            <h1 className="text-xl font-bold font-mono tracking-wider neon-glow" style={{ color: '#00f0ff' }}>
              x402 PAYMENTS
            </h1>
            <span
              className="text-[7px] font-mono tracking-widest px-2 py-0.5 rounded"
              style={{ background: '#00f0ff10', color: '#00f0ff', border: '1px solid #00f0ff25' }}
            >
              10 ENDPOINTS
            </span>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: '#4a6a8a' }}>
            // USDC micro-payments on Base · 6-tier staking discounts · endpoint analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3" style={{ color: '#f59e0b44' }} />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#f59e0b44' }}>
              Phase 2 Active
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" style={{ color: '#00f0ff33' }} />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#00f0ff33' }}>
              Payment Control
            </span>
          </div>
        </div>
      </div>

      <PaymentsDashboard />
    </div>
  );
}
