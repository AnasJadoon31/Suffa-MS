import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { MultiPicker } from "./MultiPicker";
import { peopleApi } from "@/lib/mms/endpoints";
import { peopleMutations, type GuardianDetail } from "@/lib/mms/more-endpoints";
import { maskPhone, maskBForm } from "@/lib/masks";
import { useTranslation } from "react-i18next";

function maskGuardianPhones(value: string): string {
  return value
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      return maskPhone(trimmed);
    })
    .join(", ");
}

export function GuardianForm({
  guardian,
  open,
  onOpenChange,
  triggerLabel,
}: {
  guardian?: GuardianDetail;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  triggerLabel?: string;
}) {
    const { t } = useTranslation();
  const isEdit = Boolean(guardian);
  const client = useQueryClient();
  const [name, setName] = useState(guardian?.name ?? "");
  const [relationship, setRelationship] = useState(guardian?.relationship ?? "father");
  const [phones, setPhones] = useState(guardian?.phone_numbers ?? "");
  const [cnic, setCnic] = useState(guardian?.cnic ?? "");
  const [address, setAddress] = useState(guardian?.address ?? "");
  const [lang, setLang] = useState(guardian?.preferred_language ?? "en");
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      toast.error("Enter a valid name (max 120 chars)");
      throw new Error("validation");
    }
    if (!phones.trim()) {
      toast.error("At least one phone number is required");
      throw new Error("validation");
    }

    if (isEdit && guardian) {
      await peopleMutations.updateGuardian(guardian.id, {
        name: trimmedName,
        relationship,
        phone_numbers: phones.trim(),
        cnic: cnic.trim() || undefined,
        address: address.trim() || undefined,
        preferred_language: lang,
      });
      toast.success("Guardian updated");
    } else {
      await peopleMutations.createGuardian({
        name: trimmedName,
        relationship,
        phone_numbers: phones.trim(),
        cnic: cnic.trim() || undefined,
        address: address.trim() || undefined,
        preferred_language: lang,
        student_ids: students.map((s) => s.id),
      });
      toast.success("Guardian created");
      setName("");
      setPhones("");
      setCnic("");
      setAddress("");
      setStudents([]);
    }
    void client.invalidateQueries({ queryKey: ["people"] });
  }

  return (
    <FormSheet
      title={isEdit ? "Edit guardian" : "New guardian"}
      triggerLabel={triggerLabel}
      submitLabel={isEdit ? "Save changes" : "Create guardian"}
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
      <Field label={t("Relationship *")}>
        <CustomDropdown
          required
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="father">{t("Father")}</option>
          <option value="mother">{t("Mother")}</option>
          <option value="guardian">{t("Guardian")}</option>
          <option value="other">{t("Other")}</option>
        </CustomDropdown>
      </Field>
      <Field label={t("Phone number(s) *")}>
        <TextInput
          required
          maxLength={200}
          placeholder={t("Separate multiple with commas")}
          value={phones ?? "+92"}
          onChange={(e) => setPhones(maskGuardianPhones(e.target.value))}
        />
      </Field>
      <Field label={t("CNIC")}>
          <TextInput maxLength={15} value={cnic ?? ""} onChange={(e) => setCnic(maskBForm(e.target.value))} />
      </Field>
      <Field label={t("Address")}>
        <TextInput
          maxLength={200}
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field label={t("Preferred language")}>
        <CustomDropdown value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">{t("English")}</option>
          <option value="ur">{t("Urdu")}</option>
        </CustomDropdown>
      </Field>
      {!isEdit ? (
        <MultiPicker
          label={t("Students")}
          selected={students}
          onChange={setStudents}
          queryKey="guardian-form-students"
          fetchOptions={async (search) => {
            const result = await peopleApi.listStudentsPage({ search, limit: 20, offset: 0 });
            return result.items.map((s) => ({ id: s.id, name: s.name }));
          }}
        />
      ) : null}
    </FormSheet>
  );
}
