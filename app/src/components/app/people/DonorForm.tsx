import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, TextInput } from "@/components/app/Primitives";
import { maskPhone } from "@/lib/masks";
import { financeMutations, type Donor } from "@/lib/mms/more-endpoints";

export function DonorForm({
  donor,
  open,
  onOpenChange,
  triggerLabel,
}: {
  donor?: Donor;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  triggerLabel?: string;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(donor);
  const client = useQueryClient();
  const [name, setName] = useState(donor?.name ?? "");
  const [contact, setContact] = useState(donor?.contact ?? "");

  useEffect(() => {
    setName(donor?.name ?? "");
    setContact(donor?.contact ?? "");
  }, [donor?.contact, donor?.name]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      toast.error("Enter a valid name (max 120 chars)");
      throw new Error("validation");
    }

    if (isEdit && donor) {
      await financeMutations.updateDonor(donor.id, {
        name: trimmedName,
        contact: contact.trim(),
      });
      toast.success(t("Donor saved"));
    } else {
      await financeMutations.createDonor({
        name: trimmedName,
        contact: contact.trim(),
      });
      toast.success(t("Donor recorded"));
    }

    void client.invalidateQueries({ queryKey: ["people"] });
    void client.invalidateQueries({ queryKey: ["donors"] });
    onOpenChange?.(false);
  }

  return (
    <FormSheet
      title={isEdit ? t("Edit donor") : t("Add donor")}
      open={open}
      onOpenChange={onOpenChange}
      triggerLabel={triggerLabel}
      onSubmit={handleSubmit}
    >
      <Field label={t("Full Name *")}>
        <TextInput
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("e.g. Haji Muhammad Ali")}
        />
      </Field>
      <Field label={t("Contact / Phone Number")}>
        <TextInput
          value={contact || "+92"}
          onChange={(e) => setContact(maskPhone(e.target.value))}
          placeholder={t("e.g. +92 300 1234567")}
        />
      </Field>
    </FormSheet>
  );
}
