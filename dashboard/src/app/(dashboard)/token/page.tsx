import { TokenDashboard } from "@/components/TokenDashboard";
import { Coins, Gem } from "lucide-react";

export default function TokenPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Coins className="h-5 w-5" style={{ color: '#ffd700' }} />
            <h1 className="text-xl font-bold font-mono tracking-wider" style={{ color: '#ffd700' }}>
              $XMETAV TOKEN
            </h1>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: '#4a6a8a' }}>
            // ERC-20 token on Base Mainnet — hold for tiered discounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Gem className="h-3.5 w-3.5" style={{ color: '#ffd70033' }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#ffd70033' }}>
            Token Control
          </span>
        </div>
      </div>

      <TokenDashboard />
    </div>
  );
}
