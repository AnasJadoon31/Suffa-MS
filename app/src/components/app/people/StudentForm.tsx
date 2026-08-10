import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Image, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { FilePickerField } from "@/components/app/FilePickerField";
import { AdmissionAnswerFields } from "@/components/app/admissions/AdmissionAnswerFields";
import { Field, CustomDropdown, SearchableSelect, TextInput } from "@/components/app/Primitives";
import { academicsApi, peopleApi, type AcademicClass } from "@/lib/mms/endpoints";
import { academicsExtraApi, opsApi, peopleMutations, uploadFileObject, type Section, type StudentDetail } from "@/lib/mms/more-endpoints";
import { api, apiErrorMessage } from "@/lib/mms/api";
import { maskBForm, maskPhone } from "@/lib/masks";
import { PhoneNumbersField } from "./PhoneNumbersField";
import { useTranslation } from "react-i18next";

export function StudentForm({
  student,
  open,
  onOpenChange,
  triggerLabel,
  sectionId,
}: {
  student?: StudentDetail;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  triggerLabel?: string;
  sectionId?: string;
}) {
    const { t } = useTranslation();
  const isEdit = Boolean(student);
  const client = useQueryClient();
  const [name, setName] = useState(student?.name ?? "");
  const [dob, setDob] = useState(student?.date_of_birth ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [phones, setPhones] = useState(student?.phone_list?.length ? student.phone_list : [student?.phone ?? "+92"]);
  const [defaultPhone, setDefaultPhone] = useState(student?.default_phone_number ?? student?.phone ?? "+92");
  const [bForm, setBForm] = useState(student?.b_form_number ?? "");
  const [address, setAddress] = useState(student?.address ?? "");
  const [independent, setIndependent] = useState(student?.is_independent ?? false);
  const [portal, setPortal] = useState(student?.portal_enabled ?? true);
  const [guardians, setGuardians] = useState<{ id: string; name: string }[]>([]);
  const [guardianSearch, setGuardianSearch] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [admissionFormId, setAdmissionFormId] = useState("");
  const [admissionAnswers, setAdmissionAnswers] = useState<Record<string, unknown>>({});

  const guardiansQuery = useQuery({
    queryKey: ["guardians-search", guardianSearch],
    queryFn: () => peopleApi.listGuardiansPage({ search: guardianSearch, limit: 50, offset: 0 }),
    enabled: guardianSearch.length >= 0,
  });

  const guardianOptions = (guardiansQuery.data?.items ?? [])
    .filter((g) => !guardians.some((selected) => selected.id === g.id))
    .map((g) => ({ value: g.id, label: g.name }));


  const [showNewGuardian, setShowNewGuardian] = useState(false);
  const [newGuardianName, setNewGuardianName] = useState("");
  const [newGuardianPhone, setNewGuardianPhone] = useState("");
  const [newGuardianRel, setNewGuardianRel] = useState("father");
  const [newGuardianAddress, setNewGuardianAddress] = useState("");
  const [creatingGuardian, setCreatingGuardian] = useState(false);

  const [enrollClassId, setEnrollClassId] = useState("");
  const [enrollSectionId, setEnrollSectionId] = useState(sectionId ?? "");

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: () => academicsApi.listClasses(),
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections", enrollClassId],
    queryFn: () => (enrollClassId ? academicsExtraApi.listSections(enrollClassId) : Promise.resolve([])),
    enabled: Boolean(enrollClassId),
  });

  const admissionFormsQuery = useQuery({
    queryKey: ["admission-forms"],
    queryFn: () => opsApi.listAdmissionForms(),
    enabled: !isEdit,
    retry: false,
  });

  const selectedAdmissionForm = admissionFormsQuery.data?.find((form) => form.id === admissionFormId);
  const applicationFields = (selectedAdmissionForm?.fields_definition ?? []).filter(
    (field) => field.enabled !== false && !field.built_in,
  );

  const selectedSection = useMemo(() => {
    if (!sectionId || !sectionsQuery.data) return null;
    return sectionsQuery.data.find((s) => s.id === sectionId);
  }, [sectionId, sectionsQuery.data]);

  useEffect(() => {
    if (sectionId && sectionsQuery.data) {
      const sec = sectionsQuery.data.find((s) => s.id === sectionId);
      if (sec) setEnrollClassId(sec.class_id);
    }
  }, [sectionId, sectionsQuery.data]);

  async function createGuardianInline() {
    const trimmedName = newGuardianName.trim();
    if (!trimmedName) {
      toast.error("Guardian name is required");
      return;
    }
    if (!newGuardianPhone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    setCreatingGuardian(true);
    try {
      const created = await peopleMutations.createGuardian({
        name: trimmedName,
        relationship: newGuardianRel,
        phone_numbers: newGuardianPhone.trim(),
        address: newGuardianAddress.trim() || undefined,
      });
      setGuardians((prev) => [...prev, { id: created.id, name: created.name }]);
      setNewGuardianName("");
      setNewGuardianPhone("");
      setNewGuardianRel("father");
      setNewGuardianAddress("");
      setShowNewGuardian(false);
      toast.success("Guardian created");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create guardian"));
    } finally {
      setCreatingGuardian(false);
    }
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120)
      throw toast.error("Enter a valid name (max 120 chars)");
    if (bForm && bForm.length > 20) throw toast.error("B-Form number is too long");
    if (!isEdit && !independent && guardians.length === 0) {
      throw toast.error(t("A dependent student requires at least one guardian"));
    }

    if (isEdit && student) {
      await peopleMutations.updateStudent(student.id, {
        name: trimmedName,
        date_of_birth: dob || undefined,
        phone: independent ? defaultPhone || undefined : null,
        phone_list: independent ? phones.filter((value) => value.length > 3) : [],
        default_phone_number: independent ? defaultPhone : null,
        b_form_number: bForm.trim() || undefined,
        address: independent ? address.trim() || undefined : undefined,
        is_independent: independent,
        portal_enabled: portal,
      });
      toast.success("Student updated");
    } else {
      const photoFileId = photo ? await uploadFileObject(photo, "student-photos") : undefined;
      const created = await peopleMutations.createStudent({
        name: trimmedName,
        date_of_birth: dob || undefined,
        phone: independent ? defaultPhone || undefined : undefined,
        phone_list: independent ? phones.filter((value) => value.length > 3) : [],
        default_phone_number: independent ? defaultPhone : undefined,
        b_form_number: bForm.trim() || undefined,
        address: independent ? address.trim() || undefined : undefined,
        is_independent: independent,
        portal_enabled: portal,
        guardian_ids: guardians.map((g) => g.id),
        ...(photoFileId ? { photo_file_id: photoFileId } : {}),
        ...(admissionFormId ? { admission_form_id: admissionFormId, admission_answers: admissionAnswers } : {}),
      });
      toast.success("Student created");
      setName("");
      setDob("");
      setPhone("");
      setBForm("");
      setAddress("");
      setGuardians([]);
      setPhoto(null);
      setAdmissionFormId("");
      setAdmissionAnswers({});
      setEnrollClassId("");
      setEnrollSectionId("");

      if (enrollClassId && enrollSectionId) {
        const activeSession = (await academicsApi.listSessions()).find((s) => s.is_active);
        if (activeSession) {
          try {
            await api.post("/api/v1/academics/students/enroll", {
              student_id: created.id,
              session_id: activeSession.id,
              program_id: classesQuery.data?.find((c) => c.id === enrollClassId)?.program_id,
              class_id: enrollClassId,
              section_id: enrollSectionId,
            });
            toast.success("Student enrolled");
          } catch {
            toast.warning("Student created but enrollment failed");
          }
        }
      }
    }
    void client.invalidateQueries({ queryKey: ["people"] });
  }

  return (
    <FormSheet
      title={isEdit ? "Edit student" : "New student"}
      triggerLabel={triggerLabel}
      submitLabel={isEdit ? "Save changes" : "Create student"}
      onSubmit={handleSubmit}
      open={open}
      onOpenChange={onOpenChange}
    >
      {!isEdit ? <FilePickerField label={t("Profile picture")} fileName={photo?.name} onChange={setPhoto} placeholder={t("Choose profile picture")} icon={Image} accept="image/*" /> : null}
      <Field label={t("Full name *")}>
        <TextInput
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t("Date of birth")}>
        <TextInput type="date" value={dob ?? ""} onChange={(e) => setDob(e.target.value)} />
      </Field>
      {independent ? (
        <Field label={t("Phone number(s)")}>
          <PhoneNumbersField numbers={phones} defaultNumber={defaultPhone} onChange={(next, selected) => { setPhones(next); setDefaultPhone(selected); setPhone(selected); }} />
        </Field>
      ) : null}
      <Field label={t("B-Form number")}>
          <TextInput maxLength={15} value={bForm ?? ""} onChange={(e) => setBForm(maskBForm(e.target.value))} />
      </Field>
      {independent ? (
        <Field label={t("Address")}>
          <TextInput
            maxLength={200}
            value={address ?? ""}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
      ) : null}
      {!isEdit ? (
        <>
          <Field label={t("Class")}>
            <CustomDropdown value={enrollClassId} onChange={(e) => { setEnrollClassId(e.target.value); setEnrollSectionId(""); }}>
              <option value="">{t("Optional")}</option>
              {(classesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </CustomDropdown>
          </Field>
          {enrollClassId ? (
            <Field label={t("Section")}>
              <CustomDropdown value={enrollSectionId} onChange={(e) => setEnrollSectionId(e.target.value)}>
                <option value="">{t("Optional")}</option>
                {(sectionsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.student_count} students)</option>
                ))}
              </CustomDropdown>
            </Field>
          ) : null}
        </>
      ) : null}
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={independent}
          onChange={(e) => {
            setIndependent(e.target.checked);
            if (e.target.checked) setGuardians([]);
            else { setPhone(""); setAddress(""); }
          }}
        />
        {t("Independent student")}</label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
        {t("Portal access enabled")}</label>
      {!isEdit && !independent ? (
        <>
          <Field label={t("Guardians")}>
            {guardians.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {guardians.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGuardians((prev) => prev.filter((x) => x.id !== g.id))}
                    className="rounded-full bg-primary-soft px-2.5 py-1 text-[0.68rem] font-bold text-primary"
                  >
                    {g.name} ×
                  </button>
                ))}
              </div>
            ) : null}
            <SearchableSelect
              value=""
              onChange={(id) => {
                const match = guardiansQuery.data?.items?.find((g) => g.id === id);
                if (match) {
                  setGuardians((prev) => [...prev, { id: match.id, name: match.name }]);
                  setGuardianSearch("");
                }
              }}
              options={guardianOptions}
              placeholder={t("Search guardians...")}
              searchValue={guardianSearch}
              onSearchChange={setGuardianSearch}
            />
          </Field>
          <button
            type="button"
            onClick={() => setShowNewGuardian((v) => !v)}
            className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary"
          >
            {showNewGuardian ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {t("Create new guardian")}
          </button>
          {showNewGuardian ? (
            <div className="space-y-2 rounded-2xl border border-border bg-muted/50 p-3">
              <Field label={t("Name *")}>
                <TextInput
                  required
                  maxLength={120}
                  value={newGuardianName}
                  onChange={(e) => setNewGuardianName(e.target.value)}
                />
              </Field>
              <Field label={t("Phone *")}>
                <TextInput
                  required
                  maxLength={15}
                  value={newGuardianPhone || "+92"}
                  onChange={(e) => setNewGuardianPhone(maskPhone(e.target.value))}
                />
              </Field>
              <Field label={t("Relationship")}>
                <CustomDropdown value={newGuardianRel} onChange={(e) => setNewGuardianRel(e.target.value)}>
                  <option value="father">{t("Father")}</option>
                  <option value="mother">{t("Mother")}</option>
                  <option value="brother">{t("Brother")}</option>
                  <option value="sister">{t("Sister")}</option>
                  <option value="uncle">{t("Uncle")}</option>
                  <option value="aunt">{t("Aunt")}</option>
                  <option value="grandfather">{t("Grandfather")}</option>
                  <option value="grandmother">{t("Grandmother")}</option>
                  <option value="other">{t("Other")}</option>
                </CustomDropdown>
              </Field>
              <Field label={t("Address")}>
                <TextInput
                  maxLength={200}
                  value={newGuardianAddress}
                  onChange={(e) => setNewGuardianAddress(e.target.value)}
                />
              </Field>
              <button
                type="button"
                disabled={creatingGuardian}
                onClick={createGuardianInline}
                className="gradient-emerald flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {creatingGuardian ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {t("Add guardian")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {!isEdit ? (
        <div className="space-y-3 border-t border-border pt-4">
          <Field label={t("Application form") }>
            <CustomDropdown
              value={admissionFormId}
              onChange={(event) => {
                setAdmissionFormId(event.target.value);
                setAdmissionAnswers({});
              }}
            >
              <option value="">{t("No application form")}</option>
              {(admissionFormsQuery.data ?? []).map((form) => (
                <option key={form.id} value={form.id}>{form.title}</option>
              ))}
            </CustomDropdown>
          </Field>
          {selectedAdmissionForm?.description ? <p className="text-sm text-muted-foreground">{selectedAdmissionForm.description}</p> : null}
          {selectedAdmissionForm && applicationFields.length > 0 ? (
            <AdmissionAnswerFields
              fields={applicationFields}
              answers={admissionAnswers}
              onChange={setAdmissionAnswers}
            />
          ) : null}
        </div>
      ) : null}
    </FormSheet>
  );
}
