/**
 * Settings pages own their PageHeader (the kit renders the group's section tabs
 * automatically), so this layout is just a pass-through wrapper.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col flex-1 min-h-0">{children}</div>;
}
