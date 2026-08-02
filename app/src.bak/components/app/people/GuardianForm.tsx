import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, CustomDropdown, TextInput } from "@/components/app/Primitives";
import { MultiPicker } from "./MultiPicker";
import { peopleApi } from "@/lib/mms/endpoints";
import { peopleMutations, type GuardianDetail } from "@/lib/mms/more-endpoints";

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
      <Field label="Full name *">
        <TextInput
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Relationship *">
        <CustomDropdown
          required
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="father">Father</option>
          <option value="mother">Mother</option>
          <option value="guardian">Guardian</option>
          <option value="other">Other</option>
        </CustomDropdown>
      </Field>
      <Field label="Phone number(s) *">
        <TextInput
          required
          maxLength={100}
          placeholder="Separate multiple with commas"
          value={phones ?? ""}
          onChange={(e) => setPhones(e.target.value)}
        />
      </Field>
      <Field label="CNIC">
        <TextInput maxLength={20} value={cnic ?? ""} onChange={(e) => setCnic(e.target.value)} />
      </Field>
      <Field label="Address">
        <TextInput
          maxLength={200}
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field label="Preferred language">
        <CustomDropdown value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">English</option>
          <option value="ur">Urdu</option>
        </CustomDropdown>
      </Field>
      {!isEdit ? (
        <MultiPicker
          label="Students"
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
