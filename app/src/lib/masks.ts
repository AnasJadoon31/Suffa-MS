export function maskPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (!digits.startsWith("92")) {
    return "+92";
  }
  digits = digits.slice(2);
  return "+92" + digits.slice(0, 10);
}

export function maskBForm(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return digits.slice(0, 5) + "-" + digits.slice(5);
  return digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
}
