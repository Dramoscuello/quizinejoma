import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans selection:bg-[#ffd659] selection:text-[#171818]">
        {children}
      </body>
    </html>
  );
}
