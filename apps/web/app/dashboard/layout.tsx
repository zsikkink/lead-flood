'use client';

import type { ReactNode } from 'react';

import { AppShell } from '../../src/components/app-shell.js';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
