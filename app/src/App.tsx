import { Languages } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AttendanceBoard } from "./components/AttendanceBoard";
import { DashboardCards } from "./components/DashboardCards";
import { ModuleView } from "./components/ModuleViews";
import { Sidebar } from "./components/Sidebar";
import { LoginScreen } from "./components/LoginScreen";
import { useAuth } from "./lib/AuthContext";
import type { ViewId } from "./data/mockData";

const principalPermissions: readonly string[] = [
  "attendance.mark",
  "users.manage",
  "academics.manage",
  "students.add",
  "teachers.add",
  "salary.manage",
  "assignments.manage_all",
  "results.publish",
  "timetable.manage",
  "resources.manage",
  "forms.manage",
  "announcements.manage",
  "finance.manage",
  "messaging.send",
  "reports.view",
  "blog.manage",
  "admissions.review"
];

export default function App() {
  const { i18n } = useTranslation();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const isUrdu = i18n.language === "ur";

  async function toggleLanguage(): Promise<void> {
    await i18n.changeLanguage(isUrdu ? "en" : "ur");
    document.documentElement.dir = isUrdu ? "ltr" : "rtl";
    document.documentElement.lang = isUrdu ? "en" : "ur";
  }

  function renderActiveView() {
    if (activeView === "dashboard") {
      return (
        <>
          <DashboardCards />
          <AttendanceBoard />
        </>
      );
    }

    if (activeView === "attendance") {
      return <AttendanceBoard />;
    }

    return <ModuleView view={activeView} />;
  }

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <main className="appShell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} permissions={principalPermissions} />
      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">26 June 2026 · 11 Muharram 1448</span>
            <h1>{activeView === "dashboard" ? "Principal Dashboard" : "MMS Workspace"}</h1>
          </div>
          <div className="topbar-actions">
            <button className="iconTextButton" type="button" onClick={() => void toggleLanguage()}>
              <Languages size={18} />
              {isUrdu ? "English" : "اردو"}
            </button>
            <button className="iconTextButton" type="button" onClick={logout}>
              Logout
            </button>
          </div>
        </header>
        {renderActiveView()}
      </section>
    </main>
  );
}
