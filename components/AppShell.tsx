import NavShell from './layout/NavShell'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <NavShell>{children}</NavShell>
}
