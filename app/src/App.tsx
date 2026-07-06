import { Languages } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";

import { AcademicsView } from "./components/AcademicsView";
import { AssessmentsView } from "./components/AssessmentsView";
import { AttendanceBoard } from "./components/AttendanceBoard";
import { DashboardCards } from "./components/DashboardCards";
import { LoginScreen } from "./components/LoginScreen";
import { PeopleView } from "./components/PeopleView";
import { SetPasswordPage } from "./components/SetPasswordPage";
import { Sidebar } from "./components/Sidebar";
import { useAuth } from "./lib/AuthContext";
import type { ViewId } from "./data/mockData";

function Workspace() {
  const { i18n } = useTranslation();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const isUrdu = i18n.language === "ur";

  async function toggleLanguage(): Promise<void> {
    await i18n.changeLanguage(isUrdu ? "en" : "ur");
    document.documentElement.dir = isUrdu ? "ltr" : "rtl";
    document.documentElement.lang = isUrdu ? "en" : "ur";
  }

  function renderActiveView() {
    switch (activeView) {
      case "dashboard":
        return (
          <>
            <DashboardCards />
            <AttendanceBoard />
          </>
        );
      case "attendance":
        return <AttendanceBoard />;
      case "academics":
        return <AcademicsView />;
      case "people":
        return <PeopleView />;
      case "assessments":
        return <AssessmentsView />;
      default:
        return null;
    }
  }

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <main className="appShell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{user?.username}</span>
            <h1>{activeView === "dashboard" ? "Dashboard" : "MMS Workspace"}</h1>
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

export default function App() {
  return (
    <Routes>
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="*" element={<Workspace />} />
    </Routes>
  );
}
