import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";

import { AcademicsView } from "./components/AcademicsView";
import { AdmissionsView } from "./components/AdmissionsView";
import { AnnouncementsView } from "./components/AnnouncementsView";
import { AssessmentsView } from "./components/AssessmentsView";
import { AttendanceBoard } from "./components/AttendanceBoard";
import { BlogView } from "./components/BlogView";
import { DashboardCards } from "./components/DashboardCards";
import { FinanceView } from "./components/FinanceView";
import { FormsView } from "./components/FormsView";
import { LoginScreen } from "./components/LoginScreen";
import { PeopleView } from "./components/PeopleView";
import { ReportsView } from "./components/ReportsView";
import { ResourcesView } from "./components/ResourcesView";
import { SalaryView } from "./components/SalaryView";
import { SettingsView } from "./components/SettingsView";
import { SetPasswordPage } from "./components/SetPasswordPage";
import { Sidebar } from "./components/Sidebar";
import { TimetableView } from "./components/TimetableView";
import { useAuth } from "./lib/AuthContext";
import { academicsApi } from "./lib/endpoints";
import type { ViewId } from "./data/mockData";

function Workspace() {
  const { i18n } = useTranslation();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [hijriDate, setHijriDate] = useState("");
  const isUrdu = i18n.language === "ur";

  useEffect(() => {
    if (isAuthenticated) {
      void academicsApi.today().then((d) => setHijriDate(d.hijri));
    }
  }, [isAuthenticated]);

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
            {user?.role !== "student" && <AttendanceBoard />}
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
      case "timetable":
        return <TimetableView />;
      case "resources":
        return <ResourcesView />;
      case "forms":
        return <FormsView />;
      case "announcements":
        return <AnnouncementsView />;
      case "finance":
        return <FinanceView />;
      case "salary":
        return <SalaryView />;
      case "blog":
        return <BlogView />;
      case "admissions":
        return <AdmissionsView />;
      case "settings":
        return <SettingsView />;
      case "reports":
        return <ReportsView />;
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
            {hijriDate && <small className="eyebrow">{hijriDate}</small>}
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
