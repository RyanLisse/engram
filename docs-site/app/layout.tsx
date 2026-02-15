import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: {
    default: 'Engram',
    template: '%s | Engram',
  },
  description:
    'Unified multi-agent memory system. Local-first, Convex-synced, agent-native.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
