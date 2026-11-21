import './styles.css';
export const metadata = { title: 'stream', description: 'a stream of attention' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
