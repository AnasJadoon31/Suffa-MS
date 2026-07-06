import { AlertTriangle, CircleDollarSign, ClipboardCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type DashboardData, reportingApi } from "../lib/endpoints";

export type DashboardCardsProps = Readonly<Record<string, never>>;

export function DashboardCards({}: DashboardCardsProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void reportingApi.dashboard().then(setData);
  }, []);

  const attendanceTotal = data ? data.attendance.present + data.attendance.absent + data.attendance.leave : 0;
  const cards = [
    { label: t("people"), value: data ? String(data.counts.students) : "—", detail: data ? `${data.counts.teachers} teachers · ${data.counts.classes} classes` : "", icon: UsersRound },
    {
      label: t("todayAttendance"),
      value: data ? `${data.attendance.present} / ${attendanceTotal || "—"}` : "—",
      detail: attendanceTotal ? `${Math.round((data!.attendance.present / attendanceTotal) * 100)}% present` : "No marks yet today",
      icon: ClipboardCheck,
    },
    { label: t("missingSync"), value: data ? String(data.attendance.missing_sync_teachers) : "—", detail: "Teachers without today's mark", icon: AlertTriangle },
    { label: t("monthlyIncome"), value: data ? `${data.finance.month_total.toLocaleString()} ${data.finance.currency}` : "—", detail: "Contributions + donations", icon: CircleDollarSign },
  ];

  return (
    <>
      <section className="metricGrid" aria-label="Dashboard summary">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="metricCard" key={card.label}>
              <Icon size={20} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </article>
          );
        })}
      </section>
      {data && data.activity.length > 0 && (
        <section className="modulePanel">
          <div className="moduleHeader"><h2>Recent activity</h2></div>
          <ul>
            {data.activity.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
