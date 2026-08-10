import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { FormSheet } from "@/components/app/FormSheet";
import { Field, TextInput } from "@/components/app/Primitives";
import { financeMutations, type Donor } from "@/lib/mms/more-endpoints";
import { PhoneNumbersField } from "./PhoneNumbersField";

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
  const [phones, setPhones] = useState(donor?.phone_list?.length ? donor.phone_list : [donor?.contact ?? "+92"]);
  const [defaultPhone, setDefaultPhone] = useState(donor?.default_phone_number ?? donor?.contact ?? "+92");

  useEffect(() => {
    setName(donor?.name ?? "");
    setContact(donor?.contact ?? "");
    setPhones(donor?.phone_list?.length ? donor.phone_list : [donor?.contact ?? "+92"]);
    setDefaultPhone(donor?.default_phone_number ?? donor?.contact ?? "+92");
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
        contact: defaultPhone,
        phone_list: phones.filter((phone) => phone.length > 3), default_phone_number: defaultPhone,
      });
      toast.success(t("Donor saved"));
    } else {
      await financeMutations.createDonor({
        name: trimmedName,
        contact: defaultPhone,
        phone_list: phones.filter((phone) => phone.length > 3), default_phone_number: defaultPhone,
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
        <PhoneNumbersField numbers={phones} defaultNumber={defaultPhone} onChange={(next, selected) => { setPhones(next); setDefaultPhone(selected); setContact(selected); }} />
      </Field>
    </FormSheet>
  );
}
