import { FleetTable } from "@/components/FleetTable";
import { Users, Shield } from "lucide-react";

export default function FleetPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono tracking-wider neon-glow" style={{ color: '#00f0ff' }}>
              AGENT FLEET
            </h1>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: '#4a6a8a' }}>
            // manage fleet nodes &amp; dispatch tasks to agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" style={{ color: '#00f0ff33' }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: '#00f0ff33' }}>
            Fleet Control
          </span>
        </div>
      </div>

      <FleetTable />
    </div>
  );
}
