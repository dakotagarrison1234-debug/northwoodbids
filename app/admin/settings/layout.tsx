import SettingsNav from "./SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-6 sm:p-8">
      <SettingsNav />
      {children}
    </div>
  );
}
