"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const authStr = localStorage.getItem("quizinejoma_auth");
      if (!authStr) {
        setAuthorized(false);
        router.replace("/login");
        return;
      }

      try {
        const auth = JSON.parse(authStr);
        // Check 6-hour expiration
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
          localStorage.removeItem("quizinejoma_auth");
          setAuthorized(false);
          router.replace("/login");
          return;
        }

        setAuthorized(true);
      } catch {
        localStorage.removeItem("quizinejoma_auth");
        setAuthorized(false);
        router.replace("/login");
      }
    };

    checkAuth();
  }, [pathname, router]);

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdf9f1]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#ffd659] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-[#444748]">Verificando sesión docente...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
