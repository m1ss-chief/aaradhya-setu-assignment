import { Bricolage_Grotesque, Inter } from 'next/font/google';
import './globals.css';
import './admin.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'Aaradhya Setu · Admin',
  description: 'Admin dashboard for puja bookings, workflow and devotee notifications',
};

// Root layout: fonts and global styles only. The admin chrome (sidebar) lives in
// app/(admin)/layout.js so the login page can have its own full-screen design.
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
