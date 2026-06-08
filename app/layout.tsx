import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADHD Clinic — Hiring Capacity Dashboard",
  description: "招聘容量判断看板",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
