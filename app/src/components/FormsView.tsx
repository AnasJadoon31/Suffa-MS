import { Button } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { Edit2, Eye, FileText, Plus, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import {
  academicsApi,
  operationsApi,
  peopleApi,
  reportingApi,
  type AcademicClass,
  type Course,
  type FormDef,
  type FormFieldDefinition,
  type FormResponse,
  type Guardian,
  type ParentDashboard,
  type Scope,
  type Section,
  type Student,
  type Teacher,
} from "../lib/endpoints";
import { StagedAudiencePicker } from "./StagedAudiencePicker";
import { SearchDropdown } from "./SearchDropdown";
import { useAuth } from "../lib/AuthContext";
import { Input, Select, CheckboxField } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { DataTable } from "./ui/DataTable";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { cleanFormFields, emptyFormField, FormFieldsEditor, validateFormFields } from "./FormFieldsEditor";
import { InlineFilter } from "./ui/InlineFilter";
import { ActionMenu } from "./ui/ActionMenu";
import { PhoneInput } from "./ui/PhoneInput";
import { FormStack, FormRow, FormField } from "./ui/FormLayout";

export function FormsView() {
  const { t } = useTranslation();
  const { alert, confirm } = useDialog();
  const { user, hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canCreate = !readOnly && hasPermission("forms.create");
  const canManageAll = hasPermission("forms.manage_all");
  const canViewResponses = hasPermission("forms.responses.view");
  const [forms, setForms] = useState<FormDef[]>([]);
  const [activeTab, setActiveTab] = useState<"forms" | "responses">("forms");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [formFilters, setFormFilters] = useState({ audience_role: "", class_id: "", section_id: "", course_id: "", user_id: "" });
  const [selected, setSelected] = useState<FormDef | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [responseFilters, setResponseFilters] = useState({ form_id: "", respondent_role: "", respondent_user_id: "", student_id: "", class_id: "", section_id: "", course_id: "", date_from: "", date_to: "" });
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [formPersonSearch, setFormPersonSearch] = useState("");
  const [responsePersonSearch, setResponsePersonSearch] = useState("");
  const [responseStudentSearch, setResponseStudentSearch] = useState("");
  const [wards, setWards] = useState<ParentDashboard["children"]>([]);
  const [selectedWardId, setSelectedWardId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [audience, setAudience] = useState<Scope>(user?.role === "teacher" ? { all: false } : { all: true });
  const [fields, setFields] = useState<FormFieldDefinition[]>([
    emptyFormField(),
  ]);

  const [editing, setEditing] = useState<FormDef | null>(null);
  const [editAudience, setEditAudience] = useState<Scope>({ all: true });
  const [editError, setEditError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);

  const knownCategories = useMemo(
    () => [...new Set(forms.map((f) => f.category).filter(Boolean))] as string[],
    [forms]
  );
  const allSections = useMemo(() => Object.values(sectionsByClass).flat(), [sectionsByClass]);
  const formSectionOptions = formFilters.class_id ? (sectionsByClass[formFilters.class_id] ?? []) : allSections;
  const responseSectionOptions = responseFilters.class_id ? (sectionsByClass[responseFilters.class_id] ?? []) : allSections;
  const peopleOptions = useMemo(() => [
    ...teachers.map((person) => ({ id: person.id, user_id: person.user_id, name: person.name, role: "teacher" as const })),
    ...students.map((person) => ({ id: person.id, user_id: person.user_id, name: person.name, role: "student" as const })),
    ...guardians.filter((person) => person.user_id).map((person) => ({ id: person.id, user_id: person.user_id!, name: person.name, role: "guardian" as const })),
  ], [guardians, students, teachers]);

  const load = async () => {
    setIsLoading(true);
    try {
      setForms(await operationsApi.listForms({
        category: categoryFilter || undefined,
        audience_role: formFilters.audience_role || undefined,
        class_id: formFilters.class_id || undefined,
        section_id: formFilters.section_id || undefined,
        course_id: formFilters.course_id || undefined,
        user_id: formFilters.user_id || undefined,
      }));
      setLoadError("");
    } catch (err: any) {
      setLoadError(err.response?.data?.detail ?? t("failedLoadForms"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, formFilters]);

  useEffect(() => {
    void (async () => {
      try {
        const classRows = await academicsApi.listClasses();
        setClasses(classRows);
        const sectionPairs = await Promise.all(classRows.map(async (item) => [item.id, await academicsApi.listSections(item.id)] as const));
        setSectionsByClass(Object.fromEntries(sectionPairs));
        const courseRows = (await Promise.all(classRows.map((item) => academicsApi.listCourses(item.id)))).flat();
        setCourses([...new Map(courseRows.map((course) => [course.id, course])).values()]);
        const [studentRows, teacherRows, guardianRows] = await Promise.all([
          peopleApi.listStudents().catch(() => []),
          peopleApi.listTeachers().catch(() => []),
          peopleApi.listGuardians().catch(() => []),
        ]);
        setStudents(studentRows);
        setTeachers(teacherRows);
        setGuardians(guardianRows);
      } catch {
        setClasses([]);
        setSectionsByClass({});
        setCourses([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (user?.role !== "parent") return;
    void reportingApi.dashboard().then((dashboard) => {
      if (dashboard.role !== "parent") return;
      setWards(dashboard.children);
      setSelectedWardId((current) => current || dashboard.children[0]?.id || "");
    });
  }, [user?.role]);

  useEffect(() => {
    if (activeTab !== "responses" || !canViewResponses) return;
    void operationsApi.listAllFormResponses({
      form_id: responseFilters.form_id || undefined,
      respondent_role: responseFilters.respondent_role || undefined,
      respondent_user_id: responseFilters.respondent_user_id || undefined,
      student_id: responseFilters.student_id || undefined,
      class_id: responseFilters.class_id || undefined,
      section_id: responseFilters.section_id || undefined,
      course_id: responseFilters.course_id || undefined,
      date_from: responseFilters.date_from || undefined,
      date_to: responseFilters.date_to || undefined,
    }).then(setResponses).catch(() => setResponses([]));
  }, [activeTab, canViewResponses, responseFilters]);

  const openForm = async (form: FormDef) => {
    setSelected(form);
    setAnswers({});
    setNotice("");
    setError("");
  };

  const canEditForm = (form: FormDef) => !readOnly && (canManageAll || form.created_by_id === user?.id);

  return (
    <PageSection className="formsPanel">
      <PageHeader
        title={t("forms")}
        icon={<FileText size={18} />}
        notice={t("descForms")}
      />

      <div className="tabs" role="tablist" aria-label={t("forms")}>
        <Button className={activeTab === "forms" ? "primaryAction" : "secondaryAction"} type="button" role="tab" aria-selected={activeTab === "forms"} onClick={() => setActiveTab("forms")}>{t("formsTabLabel")}</Button>
        {canViewResponses && <Button className={activeTab === "responses" ? "primaryAction" : "secondaryAction"} type="button" role="tab" aria-selected={activeTab === "responses"} onClick={() => setActiveTab("responses")}>{t("responsesTabLabel")}</Button>}
      </div>

      {activeTab === "forms" && (<>
      {canCreate && <div className="formActions formsCreateActions">
        <Button className="primaryAction" type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("createFormBtn")}</Button>
      </div>}

      {canCreate && showCreate && <FormModal
            title={t("createFormBtn")} onClose={() => setShowCreate(false)} maxWidth={800}
            onSubmit={async (e) => {
                      e.preventDefault();
                      setError("");
                      const fieldError = validateFormFields(fields);
                      if (fieldError) {
                        setError(t(fieldError));
                        return;
                      }
                      const cleanFields = cleanFormFields(fields);
                      if (!formTitle || cleanFields.length === 0) return;
                      try {
                        await operationsApi.createForm({
                          title: formTitle, description: formDescription, category: formCategory || undefined,
                          fields: cleanFields, allow_multiple: allowMultiple, visibility_scope: audience,
                        });
                        setFormTitle("");
                        setFormDescription("");
                        setFormCategory("");
                        setAllowMultiple(false);
                        setFields([emptyFormField()]);
                        setShowCreate(false);
                        await load();
                      } catch (err: any) {
                        setError(err.response?.data?.detail ?? t("failedCreateForm"));
                      }
                    }}
            submitLabel={t("createFormBtn")}
            submitIcon={<Plus size={16} />}
          >
            <FormStack>
              <FormField label={t("titleLabel")}>
                <Input required value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              </FormField>
              <FormField label={t("descriptionLabel")}>
                <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
              </FormField>
              <FormField label={t("formCategoryLabel")}>
                <Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder={t("formCategoryPlaceholder") ?? ""} list="form-categories" />
              </FormField>
              <CheckboxField
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                label={t("allowMultipleLabel")}
              />
            </FormStack>

          <StagedAudiencePicker value={audience} onChange={setAudience} />

          <FormFieldsEditor fields={fields} onChange={setFields} />
          </FormModal>}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <datalist id="form-categories">
        {knownCategories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <InlineFilter className="pwaFilterStack" filters={[
        {
          key: "category", type: "select", value: categoryFilter,
          ariaLabel: t("categoryFilterLabel"), placeholder: t("allCategories"),
          options: knownCategories.map((category) => ({ value: category, label: category })),
          onChange: setCategoryFilter,
        },
        {
          key: "audience-role", type: "select", value: formFilters.audience_role,
          placeholder: t("allRolesLabel"),
          options: [{ value: "student", label: t("students") }, { value: "teacher", label: t("teachers") }, { value: "parent", label: t("guardians") }],
          onChange: (value) => setFormFilters({ ...formFilters, audience_role: value }),
        },
        {
          key: "audience-class", type: "select", value: formFilters.class_id,
          placeholder: t("allClasses"),
          options: classes.map((item) => ({ value: item.id, label: item.name })),
          onChange: (value) => setFormFilters({ ...formFilters, class_id: value, section_id: "" }),
        },
        {
          key: "audience-section", type: "select", value: formFilters.section_id,
          placeholder: t("allSections"),
          options: formSectionOptions.map((item) => ({ value: item.id, label: item.name })),
          onChange: (value) => setFormFilters({ ...formFilters, section_id: value }),
        },
        {
          key: "audience-course", type: "select", value: formFilters.course_id,
          placeholder: t("allCourses"),
          options: courses.map((item) => ({ value: item.id, label: item.name })),
          onChange: (value) => setFormFilters({ ...formFilters, course_id: value }),
        },
      ]}>
        <SearchDropdown
          id="form-audience-person-filter"
          label={t("specificPersonFilterLabel", "Specific person")}
          placeholder={t("searchPeoplePlaceholder", "Search people")}
          items={peopleOptions}
          value={formPersonSearch}
          getKey={(person) => person.user_id}
          getLabel={(person) => person.name}
          getDescription={(person) => t(person.role)}
          onQueryChange={setFormPersonSearch}
          onSelect={(person) => {
            setFormPersonSearch(`${person.name} (${t(person.role)})`);
            setFormFilters({ ...formFilters, user_id: person.user_id });
          }}
          emptyLabel={t("noMatchingPeople")}
        />
        {formFilters.user_id && <Button className="secondaryAction" type="button" onClick={() => { setFormPersonSearch(""); setFormFilters({ ...formFilters, user_id: "" }); }}>{t("cancelBtn")}</Button>}
      </InlineFilter>

      <DataTable<FormDef>
        columns={[
          { header: t("titleCol"), render: (f) => f.title },
          { header: t("categoryFilterLabel"), render: (f) => f.category ?? "—" },
          { header: t("fieldsCol"), render: (f) => f.fields_definition.length },
          { header: t("actionsCol"), render: (f) => (
            <ActionMenu items={[
              { label: t("openBtn"), onClick: () => openForm(f) },
              ...(canEditForm(f) ? [{
                label: t("editBtn"),
                icon: <Edit2 size={14} />,
                onClick: () => {
                      setEditing(f);
                      setEditAudience(f.visibility_scope);
                      setEditError("");
                },
              }, {
                label: t("deleteBtn"),
                icon: <Trash2 size={14} />,
                destructive: true,
                onClick: async () => {
                      if (!(await confirm(t("deleteFormConfirm") ?? ""))) return;
                      try {
                        await operationsApi.deleteForm(f.id);
                        if (selected?.id === f.id) setSelected(null);
                        await load();
                      } catch (err: any) {
                        await alert(err.response?.data?.detail ?? t("failedDeleteForm"));
                      }
                },
              }] : []),
            ]} ariaLabel={`${t("actionsCol")}: ${f.title}`} />
          )},
        ]}
        data={forms}
        keyExtractor={(f) => f.id}
        isLoading={isLoading}
        error={loadError}
        emptyMessage={t("noFormsYet")}
      />

      {selected && (
        <FormModal
          title={selected.title}
          maxWidth={800}
          onClose={() => setSelected(null)}
          submitLabel={t("submitResponseBtn")}
          submitIcon={<Send size={16} />}
          error={error}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await operationsApi.submitFormResponse(selected.id, answers, user?.role === "parent" ? selectedWardId : undefined);
              setNotice(t("responseSubmitted"));
              setAnswers({});
            } catch (err: any) {
              setError(err.response?.data?.detail ?? t("failedSubmitResponse"));
            }
          }}
        >
          {notice && <p className="notice">{notice}</p>}
          {user?.role === "parent" && (
            <label>{t("wardLabel")}<Select required value={selectedWardId} onChange={(event) => setSelectedWardId(event.target.value)}>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</Select></label>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {selected.fields_definition.map((f) => (
              f.type === "phone"
                ? <PhoneInput key={f.key} id={`form-${f.key}`} label={f.label} required={f.required} value={answers[f.key] ?? ""} onChange={(value) => setAnswers({ ...answers, [f.key]: value })} />
                :
              <label key={f.key}>
                {f.label}
                <Input
                  required={f.required}
                  disabled={readOnly}
                  value={answers[f.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}
                  placeholder={f.options.length > 0 ? f.options.join(" / ") : undefined}
                />
              </label>
            ))}
          </div>
        </FormModal>
      )}

      {editing && (
        <FormModal
          title={t("editFormHeading")}
          onClose={() => setEditing(null)}
          maxWidth={800}
          submitLabel={t("editBtn")}
          error={editError}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editing) return;
            setEditError("");
            try {
              await operationsApi.updateForm(editing.id, {
                title: editing.title, description: editing.description, category: editing.category ?? undefined,
                allow_multiple: editing.allow_multiple, visibility_scope: editAudience,
              });
              setEditing(null);
              await load();
            } catch (err: any) {
              setEditError(err.response?.data?.detail ?? t("failedUpdateForm"));
            }
          }}
        >
          <FormStack>
            <FormField label={t("titleLabel")}>
              <Input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </FormField>
            <FormField label={t("descriptionLabel")}>
              <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </FormField>
            <FormField label={t("formCategoryLabel")}>
              <Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} list="form-categories" />
            </FormField>
          </FormStack>
          <StagedAudiencePicker value={editAudience} onChange={setEditAudience} />
        </FormModal>
      )}
      </>)}

      {activeTab === "responses" && canViewResponses && (
        <>
          <InlineFilter className="pwaFilterStack" filters={[
            { key: "response-form", type: "select", value: responseFilters.form_id, placeholder: t("allFormsLabel"), options: forms.map((form) => ({ value: form.id, label: form.title })), onChange: (value) => setResponseFilters({ ...responseFilters, form_id: value }) },
            { key: "response-role", type: "select", value: responseFilters.respondent_role, placeholder: t("allRolesLabel"), options: [{ value: "student", label: t("students") }, { value: "teacher", label: t("teachers") }, { value: "parent", label: t("guardians") }], onChange: (value) => setResponseFilters({ ...responseFilters, respondent_role: value }) },
            { key: "response-class", type: "select", value: responseFilters.class_id, placeholder: t("allClasses"), options: classes.map((item) => ({ value: item.id, label: item.name })), onChange: (value) => setResponseFilters({ ...responseFilters, class_id: value, section_id: "" }) },
            { key: "response-section", type: "select", value: responseFilters.section_id, placeholder: t("allSections"), options: responseSectionOptions.map((item) => ({ value: item.id, label: item.name })), onChange: (value) => setResponseFilters({ ...responseFilters, section_id: value }) },
            { key: "response-course", type: "select", value: responseFilters.course_id, placeholder: t("allCourses"), options: courses.map((item) => ({ value: item.id, label: item.name })), onChange: (value) => setResponseFilters({ ...responseFilters, course_id: value }) },
            { key: "response-from", type: "input", inputType: "date", value: responseFilters.date_from, ariaLabel: t("fromLabel"), onChange: (value) => setResponseFilters({ ...responseFilters, date_from: value }) },
            { key: "response-to", type: "input", inputType: "date", value: responseFilters.date_to, ariaLabel: t("toLabel"), onChange: (value) => setResponseFilters({ ...responseFilters, date_to: value }) },
          ]}>
            <SearchDropdown
              id="response-person-filter"
              label={t("respondentLabel")}
              placeholder={t("searchPeoplePlaceholder", "Search people")}
              items={peopleOptions}
              value={responsePersonSearch}
              getKey={(person) => person.user_id}
              getLabel={(person) => person.name}
              getDescription={(person) => t(person.role)}
              onQueryChange={setResponsePersonSearch}
              onSelect={(person) => {
                setResponsePersonSearch(`${person.name} (${t(person.role)})`);
                setResponseFilters({ ...responseFilters, respondent_user_id: person.user_id });
              }}
              emptyLabel={t("noMatchingPeople")}
            />
            <SearchDropdown
              id="response-student-filter"
              label={t("wardLabel")}
              placeholder={t("studentSearchPlaceholder")}
              items={students}
              value={responseStudentSearch}
              getKey={(student) => student.id}
              getLabel={(student) => student.name}
              getDescription={(student) => student.admission_number}
              onQueryChange={setResponseStudentSearch}
              onSelect={(student) => {
                setResponseStudentSearch(`${student.name} (${student.admission_number})`);
                setResponseFilters({ ...responseFilters, student_id: student.id });
              }}
              emptyLabel={t("noStudentsYet")}
            />
            {(responseFilters.respondent_user_id || responseFilters.student_id) && (
              <Button className="secondaryAction" type="button" onClick={() => {
                setResponsePersonSearch("");
                setResponseStudentSearch("");
                setResponseFilters({ ...responseFilters, respondent_user_id: "", student_id: "" });
              }}>{t("cancelBtn")}</Button>
            )}
          </InlineFilter>
          <DataTable<FormResponse>
            columns={[
              { header: t("formLabel"), render: (response) => forms.find((form) => form.id === response.form_id)?.title ?? "—" },
              { header: t("respondentLabel"), render: (response) => response.submitted_by_name ?? t("deletedPersonLabel") },
              { header: t("wardLabel"), render: (response) => response.ward_name ?? response.student_name ?? "—" },
              { header: t("submittedCol"), render: (response) => new Date(response.created_at).toLocaleString() },
              { header: t("actionsCol"), render: (response) => <ActionMenu items={[{ label: t("viewResponseBtn"), icon: <Eye size={14} />, onClick: () => setSelectedResponse(response) }]} /> },
            ]}
            data={responses}
            keyExtractor={(response) => response.id}
            emptyMessage={t("noResponsesYet")}
          />
        </>
      )}
      {selectedResponse && (
        <Modal title={t("responseDetailsHeading")} onClose={() => setSelectedResponse(null)}>
          <dl className="responseDetails">
            <dt>{t("respondentLabel")}</dt><dd>{selectedResponse.submitted_by_name ?? t("deletedPersonLabel")}</dd>
            <dt>{t("wardLabel")}</dt><dd>{selectedResponse.ward_name ?? selectedResponse.student_name ?? "—"}</dd>
            <dt>{t("submittedCol")}</dt><dd>{new Date(selectedResponse.created_at).toLocaleString()}</dd>
            {(forms.find((form) => form.id === selectedResponse.form_id)?.fields_definition ?? []).map((field) => {
              const value = selectedResponse.response_data[field.key];
              const display = Array.isArray(value) ? value.join(", ") : value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "—");
              return <div key={field.key} className="responseDetailRow"><dt>{field.label}</dt><dd>{display}</dd></div>;
            })}
          </dl>
        </Modal>
      )}
    </PageSection>
  );
}
