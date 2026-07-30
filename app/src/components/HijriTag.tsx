import { useHijri } from "../lib/hijri";
import { styled } from "@mui/material/styles";
import Typography from "@mui/material/Typography";

const HijriText = styled(Typography, {
  shouldForwardProp: (prop) => prop !== "inline",
})<{ inline?: boolean }>(({ theme, inline }) => ({
  color: theme.palette.text.secondary,
  fontSize: "0.75rem",
  ...(inline ? { marginInlineStart: 6 } : { display: "block" }),
}));

/** Small dual-date tag: Hijri equivalent shown under/next to a bare Gregorian
 * date (§E dual-date surfacing — Holidays, Attendance, Payment/Salary). */
export function HijriTag({ date, inline = false }: Readonly<{ date: string; inline?: boolean }>) {
  const hijri = useHijri(date);
  if (!hijri) return null;
  return (
    <HijriText as="small" inline={inline ? true : undefined}>
      {hijri}
    </HijriText>
  );
}
