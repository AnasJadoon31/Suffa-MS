import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { styled, keyframes } from "@mui/material/styles";

import { LoginScreen } from "./components/LoginScreen";
import { SessionReadOnlyBanner } from "./components/SessionSwitcher";
import { Sidebar } from "./components/Sidebar";
import { BottomTabBar } from "./components/BottomTabBar";
import { AppBar } from "./components/AppBar";
import { NavDrawer } from "./components/NavDrawer";
import { NotFoundView } from "./components/NotFoundView";
import { InstallPrompt } from "./components/InstallPrompt";
import { LoadingState, LoadingContainer } from "./components/ui/AsyncState";
import { PWA_COMPACT_BREAKPOINT } from "./components/ui/Layout";
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
}));

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ContentArea = styled("div")(({ theme }) => ({
  flex: 1,
  overflow: "auto",
  animation: `${fadeIn} 0.2s ease-out`,
  padding: theme.spacing(1.5),
  [theme.breakpoints.up("sm")]: {
    padding: theme.spacing(2.5),
  },
  [theme.breakpoints.up(PWA_COMPACT_BREAKPOINT)]: {
    padding: theme.spacing(3),
  },
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
}));

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
  const { isAuthenticated, isLoading, user, hasPermission, hasFeature } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirmNavigation } = useNavigationGuard();
  const [navOpen, setNavOpen] = useState(false);
  const [today, setToday] = useState<{ gregorian: string; hijri: string } | null>(null);

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
    <WorkspaceContainer className="appShell">
      <SkipLink href="#main-content">{t("skipToContent")}</SkipLink>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <NavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
      <MainContent id="main-content" className="workspace" tabIndex={-1}>
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
