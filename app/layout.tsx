import type { Metadata } from "next";
import "./studio.css";

export const metadata: Metadata = {
  title: "Ascend Digital Cards",
  description: "Build a better first impression. Your NFC card studio and client workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
