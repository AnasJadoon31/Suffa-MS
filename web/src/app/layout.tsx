import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Madrasa Management System",
  description: "Public website and admission portal for the Madrasa Management System"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
