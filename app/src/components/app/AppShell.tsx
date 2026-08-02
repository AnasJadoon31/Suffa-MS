import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { BottomNav, DesktopSidebar, TopBar } from "./Navigation";
import { useAuth } from "@/lib/mms/auth";

export function AppShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) void navigate({ to: "/" });
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DesktopSidebar />
      <div className="lg:ml-[16rem]">
        <TopBar title={title} subtitle={subtitle} right={right} />
        <main className="mb-safe-nav mx-auto max-w-lg px-4 pt-5 lg:mb-0 lg:max-w-5xl lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
