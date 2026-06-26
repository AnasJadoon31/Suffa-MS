import { Download, ExternalLink, Plus, Save, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { moduleSeeds, type ModuleRecord, type ViewId } from "../data/mockData";

type ModuleConfig = Readonly<{
  actionLabel: string;
  columns: readonly string[];
  fields: readonly string[];
  key: keyof typeof moduleSeeds;
  titleKey: string;
  subtitle: string;
  primaryAction?: "publish" | "approve" | "send" | "receipt" | "export" | "save";
}>;

const configs: Record<Exclude<ViewId, "dashboard" | "attendance">, ModuleConfig> = {
  auth: {
    key: "auth",
    titleKey: "auth",
    subtitle: "User provisioning, roles, portal access, and set-password dispatch.",
    actionLabel: "Provision user",
    fields: ["username", "role", "language", "state"],
    columns: ["username", "role", "language", "state"],
    primaryAction: "send"
  },
  academics: {
    key: "academics",
    titleKey: "academics",
    subtitle: "Programs, classes, sections, courses, and active academic sessions.",
    actionLabel: "Add structure",
    fields: ["program", "className", "section", "course", "session"],
    columns: ["program", "className", "section", "course", "session"],
    primaryAction: "save"
  },
  teachers: {
    key: "teachers",
    titleKey: "teachers",
    subtitle: "Teacher profiles, employee codes, assignments, and status.",
    actionLabel: "Add teacher",
    fields: ["name", "assignment", "status"],
    columns: ["code", "name", "assignment", "status"],
    primaryAction: "save"
  },
  salary: {
    key: "salary",
    titleKey: "salary",
    subtitle: "Salary records and disbursements kept separate from voluntary finance.",
    actionLabel: "Record salary",
    fields: ["teacher", "amount", "period", "method", "state"],
    columns: ["teacher", "amount", "period", "method", "state"],
    primaryAction: "save"
  },
  students: {
    key: "students",
    titleKey: "students",
    subtitle: "Student records, admission numbers, enrolment, status, and portal access.",
    actionLabel: "Add student",
    fields: ["name", "className", "portal", "state"],
    columns: ["admissionNumber", "name", "className", "portal", "state"],
    primaryAction: "send"
  },
  guardians: {
    key: "guardians",
    titleKey: "guardians",
    subtitle: "Message-only guardian contacts linked to one or more students.",
    actionLabel: "Add guardian",
    fields: ["name", "relationship", "phone", "language", "students"],
    columns: ["name", "relationship", "phone", "language", "students"],
    primaryAction: "send"
  },
  assignments: {
    key: "assignments",
    titleKey: "assignments",
    subtitle: "Class/course assignments, due dates, target students, and submissions.",
    actionLabel: "Create assignment",
    fields: ["title", "className", "course", "dueDate", "state"],
    columns: ["title", "className", "course", "dueDate", "state"],
    primaryAction: "publish"
  },
  results: {
    key: "results",
    titleKey: "results",
    subtitle: "Marks entry, grade bands, publishing, result cards, and guardian sharing.",
    actionLabel: "Add marks",
    fields: ["student", "course", "score", "grade", "state"],
    columns: ["student", "course", "score", "grade", "state"],
    primaryAction: "publish"
  },
  timetable: {
    key: "timetable",
    titleKey: "timetable",
    subtitle: "Manual timetable, leave, holidays, and offline cached schedule views.",
    actionLabel: "Add slot",
    fields: ["day", "period", "className", "course", "teacher"],
    columns: ["day", "period", "className", "course", "teacher"],
    primaryAction: "save"
  },
  resources: {
    key: "resources",
    titleKey: "resources",
    subtitle: "Resource library with files, links, categories, and class/course visibility.",
    actionLabel: "Add resource",
    fields: ["title", "category", "visibility", "type"],
    columns: ["title", "category", "visibility", "type"],
    primaryAction: "save"
  },
  forms: {
    key: "forms",
    titleKey: "forms",
    subtitle: "Form builder, response collection, open windows, and exportable responses.",
    actionLabel: "Create form",
    fields: ["title", "audience", "fields", "state"],
    columns: ["title", "audience", "fields", "state"],
    primaryAction: "publish"
  },
  announcements: {
    key: "announcements",
    titleKey: "announcements",
    subtitle: "Targeted portal feed announcements with expiry and optional delivery.",
    actionLabel: "Post announcement",
    fields: ["title", "audience", "expiry", "state"],
    columns: ["title", "audience", "expiry", "state"],
    primaryAction: "publish"
  },
  finance: {
    key: "finance",
    titleKey: "finance",
    subtitle: "Voluntary student contributions, community donations, receipts, totals.",
    actionLabel: "Record income",
    fields: ["source", "category", "amount", "state"],
    columns: ["source", "category", "amount", "state"],
    primaryAction: "receipt"
  },
  messaging: {
    key: "messaging",
    titleKey: "messaging",
    subtitle: "WhatsApp wa.me templates, credential dispatch, report sharing, and logs.",
    actionLabel: "Prepare message",
    fields: ["recipient", "phone", "template", "language", "state"],
    columns: ["recipient", "phone", "template", "language", "state"],
    primaryAction: "send"
  },
  reports: {
    key: "reports",
    titleKey: "reports",
    subtitle: "Attendance, result, finance, and activity reports with export actions.",
    actionLabel: "Create report",
    fields: ["title", "scope", "period", "format", "state"],
    columns: ["title", "scope", "period", "format", "state"],
    primaryAction: "export"
  },
  blog: {
    key: "blog",
    titleKey: "blog.manage",
    subtitle: "Public website posts, categories, tags, authorship, and publishing.",
    actionLabel: "New post",
    fields: ["title", "author", "category", "state"],
    columns: ["title", "author", "category", "state"],
    primaryAction: "publish"
  },
  admissions: {
    key: "admissions",
    titleKey: "admissions",
    subtitle: "Public registration queue, review, approval, and student creation.",
    actionLabel: "Add application",
    fields: ["student", "guardian", "program", "phone", "state"],
    columns: ["student", "guardian", "program", "phone", "state"],
    primaryAction: "approve"
  },
  settings: {
    key: "settings",
    titleKey: "settings",
    subtitle: "Institution defaults, content language, portal access, and lock policy.",
    actionLabel: "Add setting",
    fields: ["key", "value", "state"],
    columns: ["key", "value", "state"],
    primaryAction: "save"
  }
};

const storageKey = "mms-module-store-v2";

function loadStore(): Record<string, ModuleRecord[]> {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return moduleSeeds;

  try {
    return { ...moduleSeeds, ...(JSON.parse(saved) as Record<string, ModuleRecord[]>) };
  } catch {
    return moduleSeeds;
  }
}

export type ModuleViewProps = Readonly<{
  view: Exclude<ViewId, "dashboard" | "attendance">;
}>;

export function ModuleView({ view }: ModuleViewProps) {
  const { t } = useTranslation();
  const config = configs[view];
  const [store, setStore] = useState<Record<string, ModuleRecord[]>>(loadStore);
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState("Ready");
  const rows = store[config.key] ?? [];
  const filteredRows = useMemo(() => filterRows(rows, query), [query, rows]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(store));
  }, [store]);

  function saveRecord(values: Record<string, string>): void {
    const nextRecord = createRecord(config, values, rows.length);
    setStore((current) => ({ ...current, [config.key]: [nextRecord, ...(current[config.key] ?? [])] }));
    setIsAdding(false);
    setNotice(`${config.actionLabel} saved locally.`);
  }

  function updateRecord(row: ModuleRecord): void {
    const nextRow = applyPrimaryAction(row, config.primaryAction);
    setStore((current) => ({
      ...current,
      [config.key]: (current[config.key] ?? []).map((item) => (item.id === row.id ? nextRow : item))
    }));
    setNotice(getActionNotice(nextRow, config.primaryAction));
  }

  function exportCsv(): void {
    const csv = [config.columns.join(","), ...rows.map((row) => config.columns.map((column) => row[column] ?? "").join(","))].join("\n");
    window.localStorage.setItem(`mms-export-${config.key}`, csv);
    setNotice(`${t(config.titleKey)} export prepared in local storage.`);
  }

  return (
    <section className="modulePanel">
      <header className="panelHeader moduleHeader">
        <div>
          <span className="eyebrow">{config.subtitle}</span>
          <h2>{t(config.titleKey)}</h2>
        </div>
        <div className="headerActions">
          <button className="secondaryAction" type="button" onClick={exportCsv}>
            <Download size={16} />
            Export
          </button>
          <button className="primaryAction" type="button" onClick={() => setIsAdding(true)}>
            <Plus size={16} />
            {config.actionLabel}
          </button>
        </div>
      </header>

      <div className="moduleToolbar">
        <label className="searchBox">
          <span>Search</span>
          <span className="inputWithIcon">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" />
          </span>
        </label>
        <p className="notice">{notice}</p>
      </div>

      {isAdding && (
        <InlineForm
          fields={config.fields}
          submitLabel={`Save ${t(config.titleKey)}`}
          onCancel={() => setIsAdding(false)}
          onSubmit={saveRecord}
        />
      )}

      <DataTable config={config} rows={filteredRows} onRowAction={updateRecord} />
    </section>
  );
}

type InlineFormProps = Readonly<{
  fields: readonly string[];
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
  submitLabel: string;
}>;

function InlineForm({ fields, onCancel, onSubmit, submitLabel }: InlineFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  function submit(): void {
    onSubmit(values);
    setValues({});
  }

  return (
    <form
      className="inlineForm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {fields.map((field) => (
        <label key={field}>
          <span>{toLabel(field)}</span>
          <input value={values[field] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} required />
        </label>
      ))}
      <div className="formActions">
        <button className="primaryAction" type="submit">
          <Save size={16} />
          {submitLabel}
        </button>
        <button className="secondaryAction" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type DataTableProps = Readonly<{
  config: ModuleConfig;
  onRowAction: (row: ModuleRecord) => void;
  rows: readonly ModuleRecord[];
}>;

function DataTable({ config, onRowAction, rows }: DataTableProps) {
  if (rows.length === 0) {
    return <p className="emptyState">No records match this view.</p>;
  }

  return (
    <div className="dataTable" role="table">
      <div className="dataRow header" role="row">
        {config.columns.map((column) => (
          <span key={column} role="columnheader">
            {toLabel(column)}
          </span>
        ))}
        <span role="columnheader">Action</span>
      </div>
      {rows.map((row) => (
        <div className="dataRow" key={row.id} role="row">
          {config.columns.map((column) => (
            <span key={column} role="cell">
              {row[column] ?? ""}
            </span>
          ))}
          <span role="cell">
            <button className="tableAction" type="button" onClick={() => onRowAction(row)}>
              {getActionLabel(config.primaryAction)}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function createRecord(config: ModuleConfig, values: Record<string, string>, count: number): ModuleRecord {
  const generated: ModuleRecord = { id: `${config.key}-${Date.now()}` };
  for (const field of config.fields) {
    generated[field] = values[field] || defaultValueFor(field, count);
  }
  if (config.key === "students") generated.admissionNumber = `ADM-${String(count + 1).padStart(4, "0")}`;
  if (config.key === "teachers") generated.code = `TCH-${String(count + 1).padStart(4, "0")}`;
  if (!generated.state) generated.state = "Draft";
  return generated;
}

function filterRows(rows: readonly ModuleRecord[], query: string): ModuleRecord[] {
  const normalisedQuery = query.trim().toLowerCase();
  if (!normalisedQuery) return [...rows];
  return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(normalisedQuery));
}

function applyPrimaryAction(row: ModuleRecord, action: ModuleConfig["primaryAction"]): ModuleRecord {
  if (action === "publish") return { ...row, state: "Published" };
  if (action === "approve") return { ...row, state: "Approved" };
  if (action === "send") return { ...row, state: "Sent", link: buildWhatsAppLink(row) };
  if (action === "receipt") return { ...row, state: "Receipted" };
  if (action === "export") return { ...row, state: "Exported" };
  return { ...row, state: "Saved" };
}

function getActionLabel(action: ModuleConfig["primaryAction"]): string {
  if (action === "publish") return "Publish";
  if (action === "approve") return "Approve";
  if (action === "send") return "Send";
  if (action === "receipt") return "Receipt";
  if (action === "export") return "Export";
  return "Save";
}

function getActionNotice(row: ModuleRecord, action: ModuleConfig["primaryAction"]): string {
  if (action === "send" && row.link) return `WhatsApp link prepared: ${row.link}`;
  return `${getActionLabel(action)} complete for ${row.title ?? row.name ?? row.student ?? row.source ?? row.username ?? row.id}.`;
}

function buildWhatsAppLink(row: ModuleRecord): string {
  const rawPhone = row.phone ?? "923001234567";
  const phone = rawPhone.replace(/\D/g, "").replace(/^0/, "92");
  const text = encodeURIComponent(`Assalamu Alaikum, update from Madrasa Management System: ${row.template ?? row.state ?? "record ready"}`);
  return `https://wa.me/${phone}?text=${text}`;
}

function defaultValueFor(field: string, count: number): string {
  if (field === "state") return "Draft";
  if (field === "language") return "Urdu";
  if (field === "portal") return "Enabled";
  if (field === "amount") return "0";
  if (field === "score") return "0";
  return `${toLabel(field)} ${count + 1}`;
}

function toLabel(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}
