"use client";

import dynamic from "next/dynamic";

const ArenaCanvas = dynamic(
  () => import("@/components/arena/ArenaCanvas"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-full flex items-center justify-center"
        style={{ background: "#05080f" }}
      >
        <p
          className="font-mono text-sm animate-pulse"
          style={{ color: "#00f0ff44" }}
        >
          Initializing Arena...
        </p>
      </div>
    ),
  },
);

export default function ArenaPage() {
  return <ArenaCanvas />;
}
