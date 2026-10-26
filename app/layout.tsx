import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'LPG Mechanical Works Tracker', description: 'Your private workspace for LPG installation progress, inspections, and corrective actions.' };
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
