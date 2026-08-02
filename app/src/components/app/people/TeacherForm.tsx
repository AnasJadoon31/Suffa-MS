import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, TextInput } from "@/components/app/Primitives";
import { useUsernameProposal } from "./useUsernameProposal";
import { peopleMutations, type TeacherDetail } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export function TeacherForm({
  teacher,
  open,
  onOpenChange,
  triggerLabel,
}: {
  teacher?: TeacherDetail;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  triggerLabel?: string;
}) {
    const { t } = useTranslation();
  const isEdit = Boolean(teacher);
  const client = useQueryClient();
  const [name, setName] = useState(teacher?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(teacher?.whatsapp_number ?? "");
  const [qualifications, setQualifications] = useState(teacher?.qualifications ?? "");
  const [joinDate, setJoinDate] = useState(teacher?.join_date ?? "");
  const [cnic, setCnic] = useState(teacher?.cnic ?? "");
  const [address, setAddress] = useState(teacher?.address ?? "");
  const [emergency, setEmergency] = useState(teacher?.emergency_contact ?? "");
  const [delegate, setDelegate] = useState(teacher?.is_principal_delegate ?? false);
  const usernameField = useUsernameProposal(name);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      toast.error("Enter a valid name (max 120 chars)");
      throw new Error("validation");
    }
    if (!whatsapp.trim()) {
      toast.error("WhatsApp number is required");
      throw new Error("validation");
    }
    if (!isEdit && !usernameField.username.trim()) {
      toast.error("Username is required");
      throw new Error("validation");
    }

    if (isEdit && teacher) {
      await peopleMutations.updateTeacher(teacher.id, {
        name: trimmedName,
        whatsapp_number: whatsapp.trim(),
        qualifications: qualifications.trim() || undefined,
        join_date: joinDate || undefined,
        cnic: cnic.trim() || undefined,
        address: address.trim() || undefined,
        emergency_contact: emergency.trim() || undefined,
        is_principal_delegate: delegate,
      });
      toast.success("Teacher updated");
    } else {
      await peopleMutations.createTeacher({
        username: usernameField.username.trim(),
        name: trimmedName,
        whatsapp_number: whatsapp.trim(),
        qualifications: qualifications.trim() || undefined,
        join_date: joinDate || undefined,
        cnic: cnic.trim() || undefined,
        address: address.trim() || undefined,
        emergency_contact: emergency.trim() || undefined,
        is_principal_delegate: delegate,
      });
      toast.success("Teacher created");
      setName("");
      setWhatsapp("");
      setQualifications("");
      setJoinDate("");
      setCnic("");
      setAddress("");
      setEmergency("");
      setDelegate(false);
      usernameField.reset();
    }
    void client.invalidateQueries({ queryKey: ["people"] });
  }

  return (
    <FormSheet
      title={isEdit ? "Edit teacher" : "New teacher"}
      triggerLabel={triggerLabel}
      submitLabel={isEdit ? "Save changes" : "Create teacher"}
      onSubmit={handleSubmit}
      open={open}
      onOpenChange={onOpenChange}
    >
      {!isEdit ? (
        <Field label={t("Username *")}>
          <TextInput
            required
            maxLength={40}
            value={usernameField.username}
            onChange={(e) => usernameField.setUsername(e.target.value)}
          />
        </Field>
      ) : null}
      <Field label={t("Full name *")}>
        <TextInput
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t("WhatsApp number *")}>
        <TextInput
          required
          maxLength={20}
          value={whatsapp ?? ""}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </Field>
      <Field label={t("Qualifications")}>
        <TextInput
          maxLength={200}
          value={qualifications ?? ""}
          onChange={(e) => setQualifications(e.target.value)}
        />
      </Field>
      <Field label={t("Join date")}>
        <TextInput
          type="date"
          value={joinDate ?? ""}
          onChange={(e) => setJoinDate(e.target.value)}
        />
      </Field>
      <Field label={t("CNIC")}>
        <TextInput maxLength={20} value={cnic ?? ""} onChange={(e) => setCnic(e.target.value)} />
      </Field>
      <Field label={t("Address")}>
        <TextInput
          maxLength={200}
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
        />
      </Field>
      <Field label={t("Emergency contact")}>
        <TextInput
          maxLength={40}
          value={emergency ?? ""}
          onChange={(e) => setEmergency(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={delegate} onChange={(e) => setDelegate(e.target.checked)} />
        {t("Delegate as Principal (access all menus)")}</label>
    </FormSheet>
  );
}
