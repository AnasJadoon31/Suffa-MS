import { useEffect, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { academicsApi, operationsApi, type AcademicClass, type Holiday } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { HijriTag } from "./HijriTag";
import { Input, Select } from "./ui/Field";

type HolidayForm = {
  name: string;
  category: string;
  start_date: string;
  end_date: string;
  class_ids: string[];
};

const EMPTY_FORM: HolidayForm = { name: "", category: "", start_date: "", end_date: "", class_ids: [] };

export function HolidaysView() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("holidays.manage");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [filters, setFilters] = useState({ category: "", class_id: "", date_from: "", date_to: "" });
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<HolidayForm>(EMPTY_FORM);
  const [error, setError] = useState("");

  const load = async () => {
    const params: Record<string, string> = {};
    if (filters.category) params.category = filters.category;
    if (filters.class_id) params.class_id = filters.class_id;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    setHolidays(await operationsApi.listHolidays(params));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    void academicsApi.listClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  const categories = [...new Set(holidays.map((h) => h.category).filter(Boolean))] as string[];
  const classNames = (ids: string[] | null) =>
    !ids || ids.length === 0
      ? t("allClasses")
      : ids.map((id) => classes.find((c) => c.id === id)?.name ?? "—").join(", ");

  const startEditing = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setEditForm({
      name: holiday.name,
      category: holiday.category ?? "",
      start_date: holiday.start_date,
      end_date: holiday.end_date,
      class_ids: holiday.class_ids ?? [],
    });
    setError("");
  };

  const cancelEditing = () => {
    setEditingId("");
    setEditForm(EMPTY_FORM);
  };

  const saveHoliday = async (holidayId: string) => {
    setError("");
    try {
      await operationsApi.updateHoliday(holidayId, {
        name: editForm.name,
        category: editForm.category || undefined,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        class_ids: editForm.class_ids,
      });
      cancelEditing();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedUpdate"));
    }
  };

  const deleteHoliday = async (holiday: Holiday) => {
    if (!window.confirm(t("deleteHolidayConfirm", { name: holiday.name }))) return;
    setError("");
    try {
      await operationsApi.deleteHoliday(holiday.id);
      if (editingId === holiday.id) cancelEditing();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedDelete"));
    }
  };

  const classPicker = (value: string[], onChange: (next: string[]) => void) => (
    <div className="sectionPicker" style={{ gridColumn: "1 / -1" }}>
      <small className="notice">{t("holidayClassesHint")}</small>
      {classes.map((c) => (
        <label key={c.id} className="checkboxLabel">
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={() =>
              onChange(value.includes(c.id) ? value.filter((x) => x !== c.id) : [...value, c.id])
            }
          />
          {c.name}
        </label>
      ))}
    </div>
  );

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>{t("holidays")}</h2>
        <p className="notice">{t("descHolidays")}</p>
      </div>

      <div className="filterBar">
        <Select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}>
          <option value="">{t("allClasses")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await operationsApi.createHoliday({
                name: form.name,
                category: form.category || undefined,
                start_date: form.start_date,
                end_date: form.end_date,
                class_ids: form.class_ids,
              });
              setForm(EMPTY_FORM);
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedAddHoliday"));
            }
          }}
        >
          <label>{t("nameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>{t("categoryLabel")}<Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t("holidayCategoryPlaceholder")} /></label>
          <label>{t("startLabel")}<Input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <label>{t("endLabel")}<Input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          {classes.length > 0 && classPicker(form.class_ids, (class_ids) => setForm({ ...form, class_ids }))}
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> {t("addHolidayBtn")}</button></div>
        </form>
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="dataTable">
        <div className="dataRow header">
          <span>{t("nameLabel")}</span>
          <span>{t("categoryCol")}</span>
          <span>{t("startLabel")}</span>
          <span>{t("endLabel")}</span>
          <span>{t("appliesToCol")}</span>
          {canManage && <span></span>}
        </div>
        {holidays.length === 0 && <p className="emptyState">{t("noHolidays")}</p>}
        {holidays.map((holiday) => {
          const isEditing = editingId === holiday.id;
          return (
            <div className="dataRow" key={holiday.id}>
              <span>
                {isEditing ? (
                  <Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                ) : holiday.name}
              </span>
              <span>
                {isEditing ? (
                  <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
                ) : holiday.category ?? "—"}
              </span>
              <span>
                {isEditing ? (
                  <Input required type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
                ) : (
                  <>
                    {holiday.start_date}
                    <HijriTag date={holiday.start_date} />
                  </>
                )}
              </span>
              <span>
                {isEditing ? (
                  <Input required type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
                ) : (
                  <>
                    {holiday.end_date}
                    <HijriTag date={holiday.end_date} />
                  </>
                )}
              </span>
              <span>{classNames(holiday.class_ids)}</span>
              {canManage && (
                <span>
                  {isEditing ? (
                    <>
                      <button className="tableAction" type="button" onClick={() => void saveHoliday(holiday.id)}>
                        <Save size={14} /> {t("saveBtn")}
                      </button>
                      <button className="tableAction" type="button" onClick={cancelEditing}>
                        <X size={14} /> {t("cancelBtn")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="tableAction" type="button" onClick={() => startEditing(holiday)}>
                        <Pencil size={14} /> {t("editBtn")}
                      </button>
                      <button className="tableAction" type="button" onClick={() => void deleteHoliday(holiday)}>
                        <Trash2 size={14} /> {t("deleteBtn")}
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {editingId && classes.length > 0 && (
        <div className="modulePanel" style={{ marginTop: 12 }}>
          <strong>{t("appliesToCol")}</strong>
          {classPicker(editForm.class_ids, (class_ids) => setEditForm({ ...editForm, class_ids }))}
        </div>
      )}
    </section>
  );
}
