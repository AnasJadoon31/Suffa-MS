import { CalendarDays, Languages, Menu } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { styled, keyframes } from "@mui/material/styles";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";

import { LoginScreen } from "./components/LoginScreen";
import { DelegateButton } from "./components/DelegateButton";
import { SessionReadOnlyBanner, SessionSwitcher } from "./components/SessionSwitcher";
import { initialsOf, RoleBadge, Sidebar } from "./components/Sidebar";
import { BottomTabBar } from "./components/BottomTabBar";
import { AppBar } from "./components/AppBar";
import { NavDrawer } from "./components/NavDrawer";
import { PwaStatus } from "./components/PwaStatus";
import { NotFoundView } from "./components/NotFoundView";
import { InstallPrompt } from "./components/InstallPrompt";
import { LoadingState, LoadingContainer } from "./components/ui/AsyncState";
import { Button } from "./components/ui/Button";
import { useAuth } from "./lib/AuthContext";
import { academicsApi } from "./lib/endpoints";
import { useNavigationGuard } from "./lib/NavigationGuardContext";
import {
  isNavItemAccessible,
  isPortalRouteAccessible,
  navItems,
  portalRoutes,
  resolveNavItemPath,
  type PortalRoute,
  type ViewId,
} from "./data/mockData";

const lazyNamed = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
): LazyExoticComponent<Extract<T[K], ComponentType<any>>> => lazy(async () => ({
  default: (await loader())[name] as Extract<T[K], ComponentType<any>>,
}));

const AcademicsView = lazyNamed(() => import("./components/AcademicsView"), "AcademicsView");
const AdmissionsView = lazyNamed(() => import("./components/AdmissionsView"), "AdmissionsView");
const AnnouncementsView = lazyNamed(() => import("./components/AnnouncementsView"), "AnnouncementsView");
const AssessmentsView = lazyNamed(() => import("./components/AssessmentsView"), "AssessmentsView");
const AttendanceBoard = lazyNamed(() => import("./components/AttendanceBoard"), "AttendanceBoard");
const BlogView = lazyNamed(() => import("./components/BlogView"), "BlogView");
const DashboardCards = lazyNamed(() => import("./components/DashboardCards"), "DashboardCards");
const FinanceView = lazyNamed(() => import("./components/FinanceView"), "FinanceView");
const FormsView = lazyNamed(() => import("./components/FormsView"), "FormsView");
const HolidaysView = lazyNamed(() => import("./components/HolidaysView"), "HolidaysView");
const LeaveView = lazyNamed(() => import("./components/LeaveView"), "LeaveView");
const MyAssessmentsView = lazyNamed(() => import("./components/MyAssessmentsView"), "MyAssessmentsView");
const MyAttendanceView = lazyNamed(() => import("./components/MyAttendanceView"), "MyAttendanceView");
const MyTimetableView = lazyNamed(() => import("./components/MyTimetableView"), "MyTimetableView");
const PeopleView = lazyNamed(() => import("./components/PeopleView"), "PeopleView");
const PlatformView = lazyNamed(() => import("./components/PlatformView"), "PlatformView");
const ProfileView = lazyNamed(() => import("./components/ProfileView"), "ProfileView");
const PublicAdmissionPage = lazyNamed(() => import("./components/PublicAdmissionPage"), "PublicAdmissionPage");
const ReportsView = lazyNamed(() => import("./components/ReportsView"), "ReportsView");
const ResourcesView = lazyNamed(() => import("./components/ResourcesView"), "ResourcesView");
const SalaryView = lazyNamed(() => import("./components/SalaryView"), "SalaryView");
const SetPasswordPage = lazyNamed(() => import("./components/SetPasswordPage"), "SetPasswordPage");
const SettingsView = lazyNamed(() => import("./components/SettingsView"), "SettingsView");
const TimetableView = lazyNamed(() => import("./components/TimetableView"), "TimetableView");

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
  reports: ["attendance", "assessments", "finance"],
  blog: ["web"],
  settings: ["settings"],
};

const WorkspaceContainer = styled("main")(({ theme }) => ({
  display: "flex",
  minHeight: "100vh",
  backgroundColor: theme.palette.background.default,
}));

const MainContent = styled("section")(({ theme }) => ({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  [theme.breakpoints.down(768)]: {
    paddingBottom: 64, // Space for bottom tab bar
  },
}));

const Topbar = styled("header")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  [theme.breakpoints.up(768)]: {
    display: "none",
  },
}));

const TopbarContext = styled("div")({
  flex: 1,
  minWidth: 0,
});

const TopbarActions = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 4,
});

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ContentArea = styled("div")({
  flex: 1,
  overflow: "auto",
  animation: `${fadeIn} 0.2s ease-out`,
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
});

const SkipLink = styled("a")(({ theme }) => ({
  position: "absolute",
  top: -100,
  left: theme.spacing(2),
  zIndex: theme.zIndex.tooltip + 1,
  padding: theme.spacing(1, 2),
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  borderRadius: theme.shape.borderRadius,
  fontWeight: 600,
  textDecoration: "none",
  "&:focus": {
    top: theme.spacing(2),
  },
}));

function Workspace() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading, user, madrasa, hasPermission, hasFeature, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirmNavigation } = useNavigationGuard();
  const [navOpen, setNavOpen] = useState(false);
  const [today, setToday] = useState<{ gregorian: string; hijri: string } | null>(null);
  const isUrdu = i18n.language === "ur";
  const isDesktop = useMediaQuery("@media (min-width:768px)");

  const guardedNavigate = async (to: string) => {
    if (await confirmNavigation()) navigate(to);
  };

  const navigateToView = (view: ViewId) => {
    const item = navItems.find((candidate) => candidate.id === view);
    if (!item || !isNavItemAccessible(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate)) return;
    setNavOpen(false);
    void guardedNavigate(resolveNavItemPath(item, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment, user?.is_principal_delegate));
  };

  useEffect(() => {
    if (isAuthenticated) {
      void academicsApi.today().then(setToday).catch(() => setToday(null));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!user) return;
    const language = user.preferred_language === "ur" ? "ur" : "en";
    if (i18n.language !== language) void i18n.changeLanguage(language);
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [i18n, user]);

  async function toggleLanguage(): Promise<void> {
    const language = isUrdu ? "en" : "ur";
    await i18n.changeLanguage(language);
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    await updateProfile({ preferred_language: language });
  }

  function renderRoute(route: PortalRoute) {
    switch (route.key) {
      case "academicPrograms":
        return <AcademicsView tab="programs" onTabChange={(tab) => void guardedNavigate(`/academics/${tab}`)} />;
      case "academicClasses":
        return <AcademicsView tab="classes" onTabChange={(tab) => void guardedNavigate(`/academics/${tab}`)} />;
      case "academicCourses":
        return <AcademicsView tab="courses" onTabChange={(tab) => void guardedNavigate(`/academics/${tab}`)} />;
      case "academicSessions":
        return <AcademicsView tab="sessions" onTabChange={(tab) => void guardedNavigate(`/academics/${tab}`)} />;
      case "timetableGrid":
        return <TimetableView mode="grid" onModeChange={(mode) => void guardedNavigate(`/timetable/${mode}`)} />;
      case "timetableList":
        return <TimetableView mode="list" onModeChange={(mode) => void guardedNavigate(`/timetable/${mode}`)} />;
      case "timetableTeachers":
        return <TimetableView mode="teachers" onModeChange={(mode) => void guardedNavigate(`/timetable/${mode}`)} />;
      case "timetableImport":
        return <TimetableView mode="import" onModeChange={(mode) => void guardedNavigate(`/timetable/${mode}`)} />;
      case "assessmentAssignments":
        return <AssessmentsView tab="assignments" onTabChange={(tab) => void guardedNavigate(`/assessments/${tab}`)} />;
      case "assessmentGrading":
        return <AssessmentsView tab="grading" onTabChange={(tab) => void guardedNavigate(`/assessments/${tab}`)} />;
      case "assessmentSetup":
        return <AssessmentsView tab="setup" onTabChange={(tab) => void guardedNavigate(`/assessments/${tab}`)} />;
      case "assessmentResults":
        return <AssessmentsView tab="results" onTabChange={(tab) => void guardedNavigate(`/assessments/${tab}`)} />;
      case "peopleStudents":
        return <PeopleView initialTab="students" onTabChange={(tab) => void guardedNavigate(`/people/${tab}`)} />;
      case "peopleTeachers":
        return <PeopleView initialTab="teachers" onTabChange={(tab) => void guardedNavigate(`/people/${tab}`)} />;
      case "peopleGuardians":
        return <PeopleView initialTab="guardians" onTabChange={(tab) => void guardedNavigate(`/people/${tab}`)} />;
      case "peopleDonators":
        return <PeopleView initialTab="donators" onTabChange={(tab) => void guardedNavigate(`/people/${tab}`)} />;
      case "financeContributions":
        return <FinanceView tab="contributions" onTabChange={(tab) => void guardedNavigate(`/finance/${tab}`)} />;
      case "financeDonations":
        return <FinanceView tab="donations" onTabChange={(tab) => void guardedNavigate(`/finance/${tab}`)} />;
      case "financeSummary":
        return <FinanceView tab="summary" onTabChange={(tab) => void guardedNavigate(`/finance/${tab}`)} />;
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
        return <AdmissionsView section="registrations" />;
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
    return <LoadingContainer>{t("loadingLabel")}</LoadingContainer>;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (location.pathname === "/login") {
    return <Navigate to={user?.role === "super_admin" ? "/platform" : "/dashboard"} replace />;
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
    <WorkspaceContainer>
      <SkipLink href="#main-content">{t("skipToContent")}</SkipLink>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <NavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
      <MainContent id="main-content" tabIndex={-1}>
        <AppBar
          onMenuClick={() => setNavOpen(true)}
          today={today}
        />
        <SessionReadOnlyBanner />
        <ContentArea>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {portalRoutes.map((route) => (
                <Route
                  key={route.key}
                  path={route.path}
                  element={isPortalRouteAccessible(route, user?.role, hasPermission, hasFeature, user?.has_teaching_assignment) ? renderRoute(route) : <NotFoundView />}
                />
              ))}
              <Route path="*" element={<NotFoundView />} />
            </Routes>
          </Suspense>
        </ContentArea>
        <BottomTabBar onMoreClick={() => setNavOpen(true)} />
        <InstallPrompt />
      </MainContent>
    </WorkspaceContainer>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/admission/:token" element={<PublicAdmissionPage />} />
        <Route path="/public/admission/:token" element={<PublicAdmissionPage />} />
        <Route path="*" element={<Workspace />} />
      </Routes>
    </Suspense>
  );
}
