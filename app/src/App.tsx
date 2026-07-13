import { CalendarDays, Languages, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

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
import { ProfileView } from "./components/ProfileView";
import { ReportsView } from "./components/ReportsView";
import { ResourcesView } from "./components/ResourcesView";
import { SalaryView } from "./components/SalaryView";
import { SettingsView } from "./components/SettingsView";
import { DelegateButton } from "./components/DelegateButton";
import { SessionReadOnlyBanner, SessionSwitcher } from "./components/SessionSwitcher";
import { SetPasswordPage } from "./components/SetPasswordPage";
import { initialsOf, RoleBadge, Sidebar } from "./components/Sidebar";
import { TimetableView } from "./components/TimetableView";
import { MyAssessmentsView } from "./components/MyAssessmentsView";
import { MyAttendanceView } from "./components/MyAttendanceView";
import { MyTimetableView } from "./components/MyTimetableView";
import { NotFoundView } from "./components/NotFoundView";
import { useAuth } from "./lib/AuthContext";
import { academicsApi } from "./lib/endpoints";
import {
  isNavItemAccessible,
  isPortalRouteAccessible,
  navItems,
  portalRoutes,
  resolveNavItemPath,
  type PortalRoute,
  type ViewId,
} from "./data/mockData";

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
  admission_forms: ["admissions"],
  enquiries: ["admissions"],
  finance: ["finance"],
  salary: ["finance"],
  blog: ["web"],
  settings: ["settings"],
};

function Workspace() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading, user, madrasa, hasPermission, hasFeature } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [today, setToday] = useState<{ gregorian: string; hijri: string } | null>(null);
  const isUrdu = i18n.language === "ur";

  const navigateToView = (view: ViewId) => {
    const item = navItems.find((candidate) => candidate.id === view);
    if (!item || !isNavItemAccessible(item, user?.role, hasPermission, hasFeature)) return;
    setNavOpen(false);
    navigate(resolveNavItemPath(item, user?.role, hasPermission, hasFeature));
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

  function renderRoute(route: PortalRoute) {
    switch (route.key) {
      case "academicPrograms":
        return <AcademicsView tab="programs" onTabChange={(tab) => navigate(`/academics/${tab}`)} />;
      case "academicClasses":
        return <AcademicsView tab="classes" onTabChange={(tab) => navigate(`/academics/${tab}`)} />;
      case "academicCourses":
        return <AcademicsView tab="courses" onTabChange={(tab) => navigate(`/academics/${tab}`)} />;
      case "academicSessions":
        return <AcademicsView tab="sessions" onTabChange={(tab) => navigate(`/academics/${tab}`)} />;
      case "timetableGrid":
        return <TimetableView mode="grid" onModeChange={(mode) => navigate(`/timetable/${mode}`)} />;
      case "timetableList":
        return <TimetableView mode="list" onModeChange={(mode) => navigate(`/timetable/${mode}`)} />;
      case "timetableTeachers":
        return <TimetableView mode="teachers" onModeChange={(mode) => navigate(`/timetable/${mode}`)} />;
      case "timetableImport":
        return <TimetableView mode="import" onModeChange={(mode) => navigate(`/timetable/${mode}`)} />;
      case "assessmentAssignments":
        return <AssessmentsView tab="assignments" onTabChange={(tab) => navigate(`/assessments/${tab}`)} />;
      case "assessmentGrading":
        return <AssessmentsView tab="grading" onTabChange={(tab) => navigate(`/assessments/${tab}`)} />;
      case "assessmentSetup":
        return <AssessmentsView tab="setup" onTabChange={(tab) => navigate(`/assessments/${tab}`)} />;
      case "assessmentResults":
        return <AssessmentsView tab="results" onTabChange={(tab) => navigate(`/assessments/${tab}`)} />;
      case "peopleStudents":
        return <PeopleView initialTab="students" onTabChange={(tab) => navigate(tab === "admissions" ? "/admissions" : `/people/${tab}`)} />;
      case "peopleTeachers":
        return <PeopleView initialTab="teachers" onTabChange={(tab) => navigate(tab === "admissions" ? "/admissions" : `/people/${tab}`)} />;
      case "peopleGuardians":
        return <PeopleView initialTab="guardians" onTabChange={(tab) => navigate(tab === "admissions" ? "/admissions" : `/people/${tab}`)} />;
      case "peopleDonators":
        return <PeopleView initialTab="donators" onTabChange={(tab) => navigate(tab === "admissions" ? "/admissions" : `/people/${tab}`)} />;
      case "financeContributions":
        return <FinanceView tab="contributions" onTabChange={(tab) => navigate(`/finance/${tab}`)} />;
      case "financeDonations":
        return <FinanceView tab="donations" onTabChange={(tab) => navigate(`/finance/${tab}`)} />;
      case "financeSummary":
        return <FinanceView tab="summary" onTabChange={(tab) => navigate(`/finance/${tab}`)} />;
    }

    switch (route.view) {
      case "dashboard":
        return (
          <>
            <DashboardCards onNavigate={navigateToView} />
          </>
        );
      case "attendance":
        return <AttendanceBoard />;
      case "my_attendance":
        return <MyAttendanceView />;
      case "academics":
        return <AcademicsView />;
      case "people":
        return <PeopleView />;
      case "assessments":
        return <AssessmentsView />;
      case "my_assessments":
        return <MyAssessmentsView />;
      case "timetable":
        return <TimetableView />;
      case "my_timetable":
        return <MyTimetableView />;
      case "holidays":
        return <HolidaysView />;
      case "leave":
        return <LeaveView mode="manage" />;
      case "my_leave":
        return <LeaveView mode="self" />;
      case "resources":
        return <ResourcesView />;
      case "forms":
        return <FormsView />;
      case "announcements":
        return <AnnouncementsView />;
      case "finance":
        return <FinanceView />;
      case "salary":
        return <SalaryView mode="manage" />;
      case "my_salary":
        return <SalaryView mode="self" />;
      case "blog":
        return <BlogView />;
      case "admissions":
        return <PeopleView initialTab="admissions" showTabs={false} />;
      case "admission_forms":
        return <AdmissionsView section="forms" />;
      case "enquiries":
        return <AdmissionsView section="enquiries" />;
      case "settings":
        return <SettingsView />;
      case "profile":
        return <ProfileView />;
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
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/platform" replace />} />
        <Route path="/platform" element={<PlatformView />} />
        <Route path="*" element={<NotFoundView homePath="/platform" />} />
      </Routes>
    );
  }

  const activeRoute = portalRoutes.find((route) => route.path === location.pathname);
  const activeView = activeRoute?.view;
  const activeItem = navItems.find((item) => item.id === activeView);

  return (
    <main className="appShell">
      <Sidebar onNavigate={() => setNavOpen(false)} mobileOpen={navOpen} />
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
          {!user?.selected_session_id && activeView && VIEW_MODULES[activeView] && <DelegateButton modules={VIEW_MODULES[activeView]!} />}
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
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {portalRoutes.map((route) => (
            <Route
              key={route.key}
              path={route.path}
              element={isPortalRouteAccessible(route, user?.role, hasPermission, hasFeature) ? renderRoute(route) : <NotFoundView />}
            />
          ))}
          <Route path="*" element={<NotFoundView />} />
        </Routes>
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
