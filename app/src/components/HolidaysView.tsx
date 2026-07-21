import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { Pencil, Plus, Save, Trash2, X, Palmtree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import { academicsApi, operationsApi, type AcademicClass, type Holiday } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { HijriTag } from "./HijriTag";
import { Input, Select, Checkbox } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { InlineFilter } from "./ui/InlineFilter";

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
  const { confirm, alert } = useDialog();
  const { hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canManage = !readOnly && hasPermission("holidays.manage");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [filters, setFilters] = useState({ category: "", class_id: "", date_from: "", date_to: "" });
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<HolidayForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.category) params.category = filters.category;
      if (filters.class_id) params.class_id = filters.class_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      setHolidays(await operationsApi.listHolidays(params));
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedLoadHolidays"));
    } finally {
      setIsLoading(false);
    }
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
    if (!(await confirm(t("deleteHolidayConfirm", { name: holiday.name })))) return;
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
          <Checkbox
            
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
    <PageSection>
      <PageHeader
        title={t("holidays")}
        icon={<Palmtree size={18} />}
        notice={t("descHolidays")}
      />

      <InlineFilter filters={[
        { key: "category", type: "select", value: filters.category, placeholder: t("allCategories"), options: categories.map((category) => ({ value: category, label: category })), onChange: (value) => setFilters({ ...filters, category: value }) },
        { key: "class", type: "select", value: filters.class_id, placeholder: t("allClasses"), options: classes.map((item) => ({ value: item.id, label: item.name })), onChange: (value) => setFilters({ ...filters, class_id: value }) },
        { key: "date-from", type: "input", inputType: "date", value: filters.date_from, onChange: (value) => setFilters({ ...filters, date_from: value }) },
        { key: "date-to", type: "input", inputType: "date", value: filters.date_to, onChange: (value) => setFilters({ ...filters, date_to: value }) },
      ]} />

      {canManage && <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("addHolidayBtn")}</Button>}
      {canManage && showCreate && (
        <FormModal
                title={t("addHolidayBtn")} onClose={() => setShowCreate(false)}
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
                            setShowCreate(false);
                            await load();
                          } catch (err: any) {
                            setError(err.response?.data?.detail ?? t("failedAddHoliday"));
                          }
                        }}
                submitLabel={t("addHolidayBtn")}
                submitIcon={<Plus size={16} />}
              >
                <label>{t("nameLabel")}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>

              <label>{t("categoryLabel")}<Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t("holidayCategoryPlaceholder")} /></label>

              <label>{t("startLabel")}<Input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>

              <label>{t("endLabel")}<Input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>

              {classes.length > 0 && classPicker(form.class_ids, (class_ids) => setForm({ ...form, class_ids }))}
              </FormModal>
      )}

      {!isLoading && error && <ErrorState message={error} />}

      <DataTable<Holiday>
        columns={[
          { header: t("nameLabel"), render: (holiday) => editingId === holiday.id ? (
            <Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          ) : holiday.name },
          { header: t("categoryCol"), render: (holiday) => editingId === holiday.id ? (
            <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
          ) : holiday.category ?? "—" },
          { header: t("startLabel"), render: (holiday) => editingId === holiday.id ? (
            <Input required type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
          ) : (
            <>
              {holiday.start_date}
              <HijriTag date={holiday.start_date} />
            </>
          ) },
          { header: t("endLabel"), render: (holiday) => editingId === holiday.id ? (
            <Input required type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
          ) : (
            <>
              {holiday.end_date}
              <HijriTag date={holiday.end_date} />
            </>
          ) },
          { header: t("appliesToCol"), render: (holiday) => classNames(holiday.class_ids) },
          ...(canManage ? [{ header: t("actionsCol"), render: (holiday: Holiday) => editingId === holiday.id ? (
            <>
              <Button className="tableAction" type="button" onClick={() => saveHoliday(holiday.id)}>
                <Save size={14} /> {t("saveBtn")}
              </Button>
              <Button className="tableAction" type="button" onClick={cancelEditing}>
                <X size={14} /> {t("cancelBtn")}
              </Button>
            </>
          ) : (
            <>
              <Button className="tableAction" type="button" onClick={() => startEditing(holiday)}>
                <Pencil size={14} /> {t("editBtn")}
              </Button>
              <Button className="tableAction" type="button" onClick={() => deleteHoliday(holiday)}>
                <Trash2 size={14} /> {t("deleteBtn")}
              </Button>
            </>
          ) }] : []),
        ]}
        data={holidays}
        keyExtractor={(h) => h.id}
        isLoading={isLoading}
        emptyMessage={t("noHolidays")}
      />
      {editingId && classes.length > 0 && (
        <PageSection style={{ marginTop: 12 }}>
          <strong>{t("appliesToCol")}</strong>
          {classPicker(editForm.class_ids, (class_ids) => setEditForm({ ...editForm, class_ids }))}
        </PageSection>
      )}
    </PageSection>
  );
}
