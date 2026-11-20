import { DataProvider } from '@/data/query/provider';

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DataProvider>{children}</DataProvider>;
}
