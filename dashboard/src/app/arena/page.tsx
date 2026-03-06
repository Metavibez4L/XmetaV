"use client";

import dynamic from "next/dynamic";

const ArenaCanvas = dynamic(
  () => import("@/components/arena/ArenaCanvas"),
  {
    ssr: false,
    loading: () => <ArenaBootScreen />,
  },
);

function ArenaBootScreen() {
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "#05080f" }}
    >
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, #00f0ff03 2px, #00f0ff03 4px)",
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, #05080fcc 100%)",
        }}
      />

      {/* Boot logo */}
      <div className="relative z-10 text-center font-mono">
        <div className="mb-6">
          <div
            className="text-3xl font-bold tracking-[0.4em] animate-pulse"
            style={{
              color: "#00f0ff",
              textShadow: "0 0 30px #00f0ff44, 0 0 60px #00f0ff22",
            }}
          >
            XMETAV
          </div>
          <div
            className="text-[10px] tracking-[0.5em] mt-1"
            style={{ color: "#00f0ff44" }}
          >
            COMMAND CENTER
          </div>
        </div>

        {/* Boot lines */}
        <div className="text-left text-[10px] space-y-1 mb-6" style={{ color: "#39ff1488" }}>
          <BootLine delay={0}>BIOS INIT .............. OK</BootLine>
          <BootLine delay={200}>NEURAL MESH LINK ....... OK</BootLine>
          <BootLine delay={400}>AGENT FLEET SYNC ....... OK</BootLine>
          <BootLine delay={600}>PIXI RENDERER .......... LOADING</BootLine>
          <BootLine delay={800}>SUPABASE REALTIME ...... CONNECTING</BootLine>
          <BootLine delay={1000}>ISOMETRIC ENGINE ....... INIT</BootLine>
        </div>

        {/* Loading bar */}
        <div className="w-64 h-[2px] mx-auto relative overflow-hidden" style={{ background: "#00f0ff15" }}>
          <div
            className="h-full animate-[arena-boot-bar_2s_ease-in-out_infinite]"
            style={{
              background: "linear-gradient(90deg, transparent, #00f0ff, transparent)",
              width: "40%",
            }}
          />
        </div>
        <div
          className="text-[9px] mt-2 tracking-widest animate-pulse"
          style={{ color: "#00f0ff33" }}
        >
          INITIALIZING ARENA...
        </div>
      </div>

      <style>{`
        @keyframes arena-boot-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes arena-boot-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function BootLine({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <div
      className="opacity-0"
      style={{
        animation: `arena-boot-in 0.3s ease-out ${delay}ms forwards`,
      }}
    >
      {`> ${children}`}
    </div>
  );
}

export default function ArenaPage() {
  return <ArenaCanvas />;
}
