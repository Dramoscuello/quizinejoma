import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuizInejoma - Evaluaciones en Tiempo Real",
  description: "Plataforma interactiva de evaluaciones académicas en tiempo real tipo Kahoot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans selection:bg-[#ffd659] selection:text-[#171818]">
        {children}
      </body>
    </html>
  );
}
