import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, SelectInput, TextInput } from "@/components/app/Primitives";
import { MultiPicker } from "./MultiPicker";
import { useUsernameProposal } from "./useUsernameProposal";
import { peopleApi } from "@/lib/mms/endpoints";
import { peopleMutations, type StudentDetail } from "@/lib/mms/more-endpoints";

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
  const usernameField = useUsernameProposal(name);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120)
      throw toast.error("Enter a valid name (max 120 chars)");
    if (!isEdit && !usernameField.username.trim()) throw toast.error("Username is required");
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
        username: usernameField.username.trim(),
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
      usernameField.reset();
    }
    void client.invalidateQueries({ queryKey: ["people", "students"] });
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
      {!isEdit ? (
        <Field label="Username *">
          <TextInput
            required
            maxLength={40}
            value={usernameField.username}
            onChange={(e) => usernameField.setUsername(e.target.value)}
          />
        </Field>
      ) : null}
      <Field label="Full name *">
        <TextInput
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Date of birth">
        <TextInput type="date" value={dob ?? ""} onChange={(e) => setDob(e.target.value)} />
      </Field>
      <Field label="Phone">
        <TextInput maxLength={20} value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="B-Form number">
        <TextInput maxLength={20} value={bForm ?? ""} onChange={(e) => setBForm(e.target.value)} />
      </Field>
      <Field label="Address">
        <TextInput
          maxLength={200}
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      {!isEdit ? (
        <Field label="Preferred language">
          <SelectInput value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English</option>
            <option value="ur">Urdu</option>
          </SelectInput>
        </Field>
      ) : null}
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={independent}
          onChange={(e) => setIndependent(e.target.checked)}
        />
        Independent student
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
        Portal access enabled
      </label>
      {!isEdit ? (
        <MultiPicker
          label="Guardians"
          selected={guardians}
          onChange={setGuardians}
          queryKey="student-form-guardians"
          fetchOptions={async (search) => {
            const result = await peopleApi.listGuardiansPage({ search, limit: 20, offset: 0 });
            return result.items.map((g) => ({ id: g.id, name: g.name }));
          }}
        />
      ) : null}
    </FormSheet>
  );
}
