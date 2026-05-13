import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "./components/Navbar.tsx";

export const metadata: Metadata = {
  title: "peggy — the cope calculator",
  description: "the number you don't want to know but can't stop checking. paste your wallet. find out how much SOL you'd have if you'd just held.",
  openGraph: {
    title: "peggy — the cope calculator",
    description: "the number you don't want to know but can't stop checking.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
