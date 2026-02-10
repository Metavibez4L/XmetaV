import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen scanline-overlay">
      <Sidebar />
      <main className="flex-1 overflow-auto cyber-bg hex-pattern">
        {children}
      </main>
    </div>
  );
}
