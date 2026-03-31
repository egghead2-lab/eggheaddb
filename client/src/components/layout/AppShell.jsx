import { Sidebar } from './Sidebar';

export function AppShell({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[220px] min-h-screen overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
