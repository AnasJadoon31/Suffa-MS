import { styled } from "@mui/material/styles";
import { Box } from "./ui/Mui";
import { Chip } from "./ui/Mui";
import {
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  Megaphone,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../lib/AuthContext";
import { isNavItemAccessible, navItems, type ViewId } from "../data/mockData";

type QuickAction = Readonly<{
  id: string;
  labelKey: string;
  icon: LucideIcon;
  view: ViewId;
  permission?: string;
  feature?: string;
  roles?: readonly string[];
}>;

const ALL_ACTIONS: readonly QuickAction[] = [
  { id: "mark-attendance", labelKey: "attendance", icon: ClipboardCheck, view: "attendance", permission: "attendance.take", feature: "attendance" },
  { id: "add-student", labelKey: "students", icon: GraduationCap, view: "people", permission: "students.view" },
  { id: "record-payment", labelKey: "finance", icon: Landmark, view: "finance", permission: "finance.reports.view", feature: "finance", roles: ["principal", "teacher"] },
  { id: "add-teacher", labelKey: "teachers", icon: UserPlus, view: "people", permission: "teachers.view" },
  { id: "new-announcement", labelKey: "announcements", icon: Megaphone, view: "announcements", feature: "announcements" },
  { id: "open-timetable", labelKey: "timetable", icon: CalendarCheck, view: "timetable", permission: "timetable.manage", feature: "timetable", roles: ["principal", "teacher"] },
];

const QuickActionsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`,
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": {
    display: "none",
  },
  [theme.breakpoints.up(768)]: {
    padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
  },
}));

const ActionChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== "isActive",
})<{ isActive?: boolean }>(({ theme }) => ({
  borderRadius: 999,
  fontWeight: 600,
  fontSize: "0.8rem",
  height: 40,
  paddingInline: 4,
  cursor: "pointer",
  flexShrink: 0,
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  color: theme.palette.text.primary,
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
    borderColor: theme.palette.primary.main,
  },
  "& .MuiChip-icon": {
    marginLeft: 12,
    marginRight: -4,
    color: theme.palette.primary.main,
  },
  "& .MuiChip-label": {
    paddingLeft: 8,
    paddingRight: 16,
  },
}));

export type QuickActionsProps = Readonly<{
  onNavigate?: (view: ViewId) => void;
}>;

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const { t } = useTranslation();
  const { hasPermission, hasFeature, user } = useAuth();

  const visible = ALL_ACTIONS.filter((action) => {
    if (action.roles && (!user || !action.roles.includes(user.role))) return false;
    if (action.permission && !hasPermission(action.permission)) return false;
    if (action.feature && !hasFeature(action.feature)) return false;
    return true;
  });

  if (visible.length === 0) return null;

  return (
    <nav aria-label={t("quickActionsLabel")}>
      <QuickActionsContainer>
        {visible.map((action) => {
          const Icon = action.icon;
          return (
            <ActionChip
              key={action.id}
              icon={<Icon size={16} />}
              label={t(action.labelKey)}
              onClick={() => onNavigate?.(action.view)}
            />
          );
        })}
      </QuickActionsContainer>
    </nav>
  );
}
