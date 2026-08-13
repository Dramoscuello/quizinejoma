"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, User, School, History, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";

interface TopNavBarProps {
  activeTab?: "dashboard" | "grades" | "quizzes" | "history";
}

export default function TopNavBar({ activeTab }: TopNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("Docente");

  useEffect(() => {
    try {
      const authStr = localStorage.getItem("quizinejoma_auth");
      if (authStr) {
        const auth = JSON.parse(authStr);
        if (auth.username) setUsername(auth.username);
      }
    } catch {
      // safe
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("quizinejoma_auth");
    router.replace("/login");
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Grados", href: "/grades", icon: School },
    { label: "Historial", href: "/history", icon: History },
  ];

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-[1120px] rounded-full border border-[#e6e2da]/60 shadow-[0px_10px_30px_rgba(44,44,44,0.05)] bg-[#fdf9f1]/80 backdrop-blur-md flex justify-between items-center px-6 md:px-8 py-3 z-50 transition-all duration-300">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2 group">
        <span className="font-bold text-2xl tracking-tight text-[#171818] relative inline-block">
          QuizInejoma
          <span className="absolute -bottom-0.5 left-0 w-0 group-hover:w-full h-1 bg-[#ffd659] rounded-full transition-all duration-300"></span>
        </span>
      </Link>

      {/* Nav Links */}
      <nav className="hidden md:flex items-center gap-2 font-medium text-sm">
        {navItems.map((item) => {
          const isActive =
            (activeTab && item.label.toLowerCase() === activeTab.toLowerCase()) ||
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-5 py-2 rounded-full transition-all duration-200 flex items-center gap-1.5 ${
                isActive
                  ? "bg-[#2c2c2c] text-white shadow-sm font-semibold"
                  : "text-[#444748] hover:text-[#171818] hover:bg-[#f1ede6]/60"
              }`}
            >
              <item.icon className="w-4 h-4 opacity-80" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Actions (Teacher Admin Only) */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-full border border-[#e6e2da] shadow-xs">
            <div className="w-6 h-6 rounded-full bg-[#2c2c2c] text-white flex items-center justify-center font-bold text-[10px]">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-[#171818] truncate max-w-[120px]">
              {username}
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#737373] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/50 transition-colors border border-[#e6e2da]/50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
