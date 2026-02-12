import { PaymentsDashboard } from "@/components/PaymentsDashboard";
import { Wallet, Shield } from "lucide-react";

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
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: '#4a6a8a' }}>
            // autonomous agent payments via x402 protocol on Base
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" style={{ color: '#00f0ff33' }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#00f0ff33' }}>
            Payment Control
          </span>
        </div>
      </div>

      <PaymentsDashboard />
    </div>
  );
}
