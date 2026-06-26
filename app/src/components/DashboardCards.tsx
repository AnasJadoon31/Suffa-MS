import { AlertTriangle, CircleDollarSign, ClipboardCheck, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";

export type DashboardCardsProps = Readonly<Record<string, never>>;

export function DashboardCards({}: DashboardCardsProps) {
  const { t } = useTranslation();
  const cards = [
    { label: t("students"), value: "128", detail: "4 new this week", icon: UsersRound },
    { label: t("todayAttendance"), value: "42 / 46", detail: "91% present", icon: ClipboardCheck },
    { label: t("missingSync"), value: "1", detail: "Teacher device pending", icon: AlertTriangle },
    { label: t("monthlyIncome"), value: "184,500 PKR", detail: "Voluntary ledger", icon: CircleDollarSign }
  ];

  return (
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
  );
}
