import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { MultiPicker } from "./MultiPicker";
import { PhoneNumbersField } from "./PhoneNumbersField";
import { peopleApi } from "@/lib/mms/endpoints";
import { peopleMutations, type GuardianDetail } from "@/lib/mms/more-endpoints";
import { maskBForm } from "@/lib/masks";
import { useTranslation } from "react-i18next";

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
  const [phones, setPhones] = useState(guardian?.phone_list?.length ? guardian.phone_list : guardian?.phone_numbers ? guardian.phone_numbers.split(",").map((phone) => phone.trim()) : ["+92"]);
  const [defaultPhone, setDefaultPhone] = useState(guardian?.default_phone_number ?? phones[0] ?? "+92");
  const [cnic, setCnic] = useState(guardian?.cnic ?? "");
  const [address, setAddress] = useState(guardian?.address ?? "");
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      toast.error("Enter a valid name (max 120 chars)");
      throw new Error("validation");
    }
    if (!phones.some((phone) => phone.length > 3)) {
      toast.error("At least one phone number is required");
      throw new Error("validation");
    }

    if (isEdit && guardian) {
      await peopleMutations.updateGuardian(guardian.id, {
        name: trimmedName,
        relationship,
        phone_numbers: defaultPhone,
        phone_list: phones.filter((phone) => phone.length > 3),
        default_phone_number: defaultPhone,
        cnic: cnic.trim() || undefined,
        address: address.trim() || undefined,
      });
      toast.success("Guardian updated");
    } else {
      await peopleMutations.createGuardian({
        name: trimmedName,
        relationship,
        phone_numbers: defaultPhone,
        phone_list: phones.filter((phone) => phone.length > 3),
        default_phone_number: defaultPhone,
        cnic: cnic.trim() || undefined,
        address: address.trim() || undefined,
        student_ids: students.map((s) => s.id),
      });
      toast.success("Guardian created");
      setName("");
      setPhones(["+92"]);
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
        <PhoneNumbersField numbers={phones} defaultNumber={defaultPhone} onChange={(next, selected) => { setPhones(next); setDefaultPhone(selected); }} />
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
