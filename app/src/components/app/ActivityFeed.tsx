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

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  title: string;
  description?: string;
  timestamp: string;
};

const EVENT_ICONS: Record<ActivityEventType, LucideIcon> = {
  attendance: ClipboardCheck,
  enrollment: GraduationCap,
  payment: Landmark,
  announcement: Megaphone,
  form: FileText,
  timetable: CalendarCheck,
};

const EVENT_COLORS: Record<ActivityEventType, string> = {
  attendance: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950",
  enrollment: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950",
  payment: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  announcement: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950",
  form: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  timetable: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950",
};

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

export function ActivityFeed({ events = [] }: { events?: ActivityEvent[] }) {
  const { t } = useTranslation();

  return (
    <div className="mx-4 rounded-2xl border border-border bg-card p-4 lg:mx-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("recentActivityHeading")}</h2>
      </div>
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
          <FileText className="h-10 w-10 stroke-[1.5]" />
          <p className="text-sm">{t("noRecentActivity")}</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {events.map((event) => {
            const Icon = EVENT_ICONS[event.type];
            const colorClass = EVENT_COLORS[event.type];
            return (
              <li key={event.id} className="relative flex gap-3 py-2">
                {event.id !== events[events.length - 1]?.id && (
                  <div className="absolute left-[15px] top-10 bottom-0 w-0.5 bg-border" />
                )}
                <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{event.title}</p>
                  {event.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {relativeTime(event.timestamp)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
