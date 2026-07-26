import type { FormFieldDefinition } from "./endpoints";

export const BUILT_IN_ADMISSION_KEYS = {
  studentName: "student_name",
  studentDateOfBirth: "student_date_of_birth",
  studentBFormNumber: "student_b_form_number",
  studentAddress: "student_address",
  studentPhone: "student_phone",
  studentPortalEnabled: "student_portal_enabled",
  guardianName: "guardian_name",
  guardianRelationship: "guardian_relationship",
  guardianPhoneNumbers: "guardian_phone_numbers",
  guardianCnic: "guardian_cnic",
  guardianAddress: "guardian_address",
  guardianPreferredLanguage: "guardian_preferred_language",
  guardianPortalEnabled: "guardian_portal_enabled",
} as const;

export const DEFAULT_BUILT_IN_ADMISSION_FIELDS: FormFieldDefinition[] = [
  { key: BUILT_IN_ADMISSION_KEYS.studentName, label: "Student name", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.studentDateOfBirth, label: "Date of birth", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.studentBFormNumber, label: "B-Form number", type: "text", required: false, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.studentAddress, label: "Student address", type: "textarea", required: false, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.studentPhone, label: "Student phone", type: "phone", required: false, options: [], built_in: true, enabled: false },
  { key: BUILT_IN_ADMISSION_KEYS.studentPortalEnabled, label: "Student portal", type: "dropdown", required: true, options: ["enabled", "disabled"], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianName, label: "Guardian name", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianRelationship, label: "Guardian relationship", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianPhoneNumbers, label: "Guardian phone number", type: "phone", required: true, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianCnic, label: "Guardian CNIC", type: "text", required: false, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianAddress, label: "Guardian address", type: "textarea", required: false, options: [], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianPreferredLanguage, label: "Guardian preferred language", type: "dropdown", required: true, options: ["ur", "en"], built_in: true, enabled: true },
  { key: BUILT_IN_ADMISSION_KEYS.guardianPortalEnabled, label: "Guardian portal", type: "dropdown", required: true, options: ["enabled", "disabled"], built_in: true, enabled: true },
];

export function mergeAdmissionBuiltIns(fields: FormFieldDefinition[]): FormFieldDefinition[] {
  const incoming = new Map(fields.map((field) => [field.key, field]));
  const builtIns = DEFAULT_BUILT_IN_ADMISSION_FIELDS.map((field) => ({
    ...field,
    ...(incoming.get(field.key) ?? {}),
    key: field.key,
    type: field.type,
    built_in: true,
    options: field.options,
  }));
  const customFields = fields.filter((field) => !field.built_in && !DEFAULT_BUILT_IN_ADMISSION_FIELDS.some((builtIn) => builtIn.key === field.key));
  return [...builtIns, ...customFields];
}

export function enabledAdmissionFields(fields: FormFieldDefinition[]): FormFieldDefinition[] {
  return fields.filter((field) => field.enabled !== false);
}

export function answerString(answers: Record<string, unknown>, key: string): string {
  return String(answers[key] ?? "").trim();
}
