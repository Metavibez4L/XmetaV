export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: "#05080f" }}
    >
      {children}
    </div>
  );
}
