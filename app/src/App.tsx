import { CalendarDays, Languages, Menu } from "lucide-react";
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
import { HolidaysView } from "./components/HolidaysView";
import { LeaveView } from "./components/LeaveView";
import { LoginScreen } from "./components/LoginScreen";
import { PeopleView } from "./components/PeopleView";
import { PlatformView } from "./components/PlatformView";
import { ReportsView } from "./components/ReportsView";
import { ResourcesView } from "./components/ResourcesView";
import { SalaryView } from "./components/SalaryView";
import { SettingsView } from "./components/SettingsView";
import { DelegateButton } from "./components/DelegateButton";
import { SessionReadOnlyBanner, SessionSwitcher } from "./components/SessionSwitcher";
import { SetPasswordPage } from "./components/SetPasswordPage";
import { initialsOf, RoleBadge, Sidebar } from "./components/Sidebar";
import { TimetableView } from "./components/TimetableView";
import { useAuth } from "./lib/AuthContext";
import { academicsApi } from "./lib/endpoints";
import { navItems, type ViewId } from "./data/mockData";

const VIEW_STORAGE_KEY = "mms_active_view";

// Screen → permission modules, for the per-screen "Delegate…" control (§3).
const VIEW_MODULES: Partial<Record<ViewId, string[]>> = {
  attendance: ["attendance"],
  timetable: ["timetable"],
  holidays: ["holidays"],
  leave: ["leave"],
  announcements: ["announcements"],
  academics: ["academics"],
  assessments: ["assignments", "assessments"],
  resources: ["resources"],
  forms: ["forms"],
  people: ["people", "auth"],
  admissions: ["admissions"],
  finance: ["finance"],
  salary: ["finance"],
  blog: ["web"],
  settings: ["settings"],
};

function loadInitialView(): ViewId {
  const stored = localStorage.getItem(VIEW_STORAGE_KEY);
  return navItems.some((item) => item.id === stored) ? (stored as ViewId) : "dashboard";
}

function Workspace() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading, user, madrasa } = useAuth();
  const [activeView, setActiveViewState] = useState<ViewId>(loadInitialView);
  const [navOpen, setNavOpen] = useState(false);
  const [today, setToday] = useState<{ gregorian: string; hijri: string } | null>(null);
  const isUrdu = i18n.language === "ur";

  const setActiveView = (view: ViewId) => {
    setActiveViewState(view);
    setNavOpen(false);
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  };

  useEffect(() => {
    if (isAuthenticated) {
      void academicsApi.today().then(setToday).catch(() => setToday(null));
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
            <DashboardCards onNavigate={setActiveView} />
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
      case "holidays":
        return <HolidaysView />;
      case "leave":
        return <LeaveView />;
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

  if (user?.role === "super_admin") {
    return <PlatformView />;
  }

  const activeItem = navItems.find((item) => item.id === activeView);

  return (
    <main className="appShell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} mobileOpen={navOpen} />
      {navOpen && <div className="navOverlay" onClick={() => setNavOpen(false)} />}
      <section className="workspace">
        <header className="topbar">
          <button
            className="iconButton navToggle"
            type="button"
            aria-label={t("openMenu")}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Menu size={20} />
          </button>
          <div className="topbarContext">
            <h1>{activeItem ? t(activeItem.labelKey) : t("appName")}</h1>
            <p className="viewDescription">{activeItem ? t(activeItem.descKey) : ""}</p>
          </div>
          {VIEW_MODULES[activeView] && <DelegateButton modules={VIEW_MODULES[activeView]!} />}
          <div className="topbar-actions">
            {today && (
              <span className="dateChip" title={t("todayLabel")}>
                <CalendarDays size={15} />
                <span className="dateChipText">
                  <strong>{today.gregorian}</strong>
                  <small>{today.hijri}</small>
                </span>
              </span>
            )}
            <SessionSwitcher />
            <button className="iconTextButton" type="button" onClick={() => void toggleLanguage()}>
              <Languages size={16} />
              {isUrdu ? "English" : "اردو"}
            </button>
            {user && (
              <span className="profileChip" title={madrasa?.name ?? ""}>
                <span className="avatar avatarSmall" aria-hidden="true">{initialsOf(user.username)}</span>
                <span className="profileChipText">
                  <strong>{user.username}</strong>
                  <RoleBadge role={user.role} />
                </span>
              </span>
            )}
          </div>
        </header>
        <SessionReadOnlyBanner />
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
