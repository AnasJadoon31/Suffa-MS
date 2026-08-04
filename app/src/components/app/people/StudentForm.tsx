import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { MultiPicker } from "./MultiPicker";
import { peopleApi } from "@/lib/mms/endpoints";
import { peopleMutations, type StudentDetail } from "@/lib/mms/more-endpoints";
import { apiErrorMessage } from "@/lib/mms/api";
import { useTranslation } from "react-i18next";

export function StudentForm({
  student,
  open,
  onOpenChange,
  triggerLabel,
}: {
  student?: StudentDetail;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  triggerLabel?: string;
}) {
    const { t } = useTranslation();
  const isEdit = Boolean(student);
  const client = useQueryClient();
  const [name, setName] = useState(student?.name ?? "");
  const [dob, setDob] = useState(student?.date_of_birth ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [bForm, setBForm] = useState(student?.b_form_number ?? "");
  const [address, setAddress] = useState(student?.address ?? "");
  const [independent, setIndependent] = useState(student?.is_independent ?? false);
  const [portal, setPortal] = useState(student?.portal_enabled ?? true);
  const [lang, setLang] = useState(student?.preferred_language ?? "en");
  const [guardians, setGuardians] = useState<{ id: string; name: string }[]>([]);

  const [showNewGuardian, setShowNewGuardian] = useState(false);
  const [newGuardianName, setNewGuardianName] = useState("");
  const [newGuardianPhone, setNewGuardianPhone] = useState("");
  const [newGuardianRel, setNewGuardianRel] = useState("father");
  const [creatingGuardian, setCreatingGuardian] = useState(false);

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
      });
      setGuardians((prev) => [...prev, { id: created.id, name: created.name }]);
      setNewGuardianName("");
      setNewGuardianPhone("");
      setNewGuardianRel("father");
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

    if (isEdit && student) {
      await peopleMutations.updateStudent(student.id, {
        name: trimmedName,
        date_of_birth: dob || undefined,
        phone: phone.trim() || undefined,
        b_form_number: bForm.trim() || undefined,
        address: address.trim() || undefined,
        is_independent: independent,
        portal_enabled: portal,
      });
      toast.success("Student updated");
    } else {
      await peopleMutations.createStudent({
        name: trimmedName,
        date_of_birth: dob || undefined,
        phone: phone.trim() || undefined,
        b_form_number: bForm.trim() || undefined,
        address: address.trim() || undefined,
        is_independent: independent,
        portal_enabled: portal,
        preferred_language: lang,
        guardian_ids: guardians.map((g) => g.id),
      });
      toast.success("Student created");
      setName("");
      setDob("");
      setPhone("");
      setBForm("");
      setAddress("");
      setGuardians([]);
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
      <Field label={t("Phone")}>
        <TextInput maxLength={20} value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label={t("B-Form number")}>
        <TextInput maxLength={20} value={bForm ?? ""} onChange={(e) => setBForm(e.target.value)} />
      </Field>
      <Field label={t("Address")}>
        <TextInput
          maxLength={200}
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      {!isEdit ? (
        <Field label={t("Preferred language")}>
          <CustomDropdown value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">{t("English")}</option>
            <option value="ur">{t("Urdu")}</option>
          </CustomDropdown>
        </Field>
      ) : null}
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={independent}
          onChange={(e) => { setIndependent(e.target.checked); if (e.target.checked) setGuardians([]); }}
        />
        {t("Independent student")}</label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
        {t("Portal access enabled")}</label>
      {!isEdit && !independent ? (
        <>
          <MultiPicker
            label={t("Guardians")}
            selected={guardians}
            onChange={setGuardians}
            queryKey="student-form-guardians"
            fetchOptions={async (search) => {
              const result = await peopleApi.listGuardiansPage({ search, limit: 20, offset: 0 });
              return result.items.map((g) => ({ id: g.id, name: g.name }));
            }}
          />
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
                  maxLength={50}
                  value={newGuardianPhone}
                  onChange={(e) => setNewGuardianPhone(e.target.value)}
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
    </FormSheet>
  );
}
