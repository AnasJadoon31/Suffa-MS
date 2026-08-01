import { styled, useTheme } from "@mui/material/styles";
import { Box } from "./ui/Mui";
import { Paper } from "./ui/Mui";
import { Typography } from "./ui/Mui";
import {
  CalendarCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Landmark,
  Megaphone,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type ActivityEventType = "attendance" | "enrollment" | "payment" | "announcement" | "form" | "timetable";

type ActivityEvent = Readonly<{
  id: string;
  type: ActivityEventType;
  title: string;
  description?: string;
  timestamp: string; // ISO string
}>;

const EVENT_ICONS: Record<ActivityEventType, LucideIcon> = {
  attendance: ClipboardCheck,
  enrollment: GraduationCap,
  payment: Landmark,
  announcement: Megaphone,
  form: FileText,
  timetable: CalendarCheck,
};

function getEventColor(type: ActivityEventType, mode: "light" | "dark"): string {
  const colors: Record<ActivityEventType, { light: string; dark: string }> = {
    attendance: { light: "#0f766e", dark: "#7bc5bb" },
    enrollment: { light: "#3f7f4c", dark: "#9bc7a9" },
    payment: { light: "#c77d1a", dark: "#efb45f" },
    announcement: { light: "#0f766e", dark: "#7bc5bb" },
    form: { light: "#c77d1a", dark: "#efb45f" },
    timetable: { light: "#3f7f4c", dark: "#9bc7a9" },
  };
  return colors[type]?.[mode] ?? "#0f766e";
}

function relativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now.getTime() - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

const FeedContainer = styled(Paper)(({ theme }) => ({
  margin: theme.spacing(2),
  padding: theme.spacing(2),
  borderRadius: 16,
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  [theme.breakpoints.up(768)]: {
    margin: theme.spacing(3),
  },
}));

const FeedHeader = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
});

const Timeline = styled("ul")({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 0,
});

const TimelineItem = styled("li")(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1.5),
  padding: `${theme.spacing(1)} 0`,
  position: "relative",
  "&:not(:last-child)::after": {
    content: '""',
    position: "absolute",
    left: 15,
    top: 40,
    bottom: 0,
    width: 2,
    backgroundColor: theme.palette.divider,
  },
}));

const IconDot = styled("div")<{ color: string }>(({ theme, color }) => ({
  width: 32,
  height: 32,
  minWidth: 32,
  borderRadius: "50%",
  backgroundColor: `${color}18`,
  color: color,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 4,
  position: "relative",
  zIndex: 1,
}));

const ItemContent = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const EmptyState = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: `${theme.spacing(4)} 0`,
  gap: theme.spacing(1),
  color: theme.palette.text.secondary,
  textAlign: "center",
}));

export type ActivityFeedProps = Readonly<{
  events?: ActivityEvent[];
}>;

export function ActivityFeed({ events = [] }: ActivityFeedProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const mode = theme.palette.mode;

  if (events.length === 0) {
    return (
      <FeedContainer aria-label={t("recentActivityHeading")}>
        <FeedHeader>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, fontSize: "1rem" }}>
            {t("recentActivityHeading")}
          </Typography>
        </FeedHeader>
        <EmptyState>
          <FileText size={40} strokeWidth={1.5} />
          <Typography variant="body2">{t("noRecentActivity")}</Typography>
        </EmptyState>
      </FeedContainer>
    );
  }

  return (
    <FeedContainer aria-label={t("recentActivityHeading")}>
      <FeedHeader>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600, fontSize: "1rem" }}>
          {t("recentActivityHeading")}
        </Typography>
      </FeedHeader>
      <Timeline>
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.type];
          const color = getEventColor(event.type, mode);
          return (
            <TimelineItem key={event.id}>
              <IconDot color={color}>
                <Icon size={16} />
              </IconDot>
              <ItemContent>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  {event.title}
                </Typography>
                {event.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {event.description}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {relativeTime(event.timestamp)}
                </Typography>
              </ItemContent>
            </TimelineItem>
          );
        })}
      </Timeline>
    </FeedContainer>
  );
}
