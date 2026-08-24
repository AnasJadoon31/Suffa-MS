import { Plus, Star, Trash2 } from "lucide-react";

import { TextInput } from "@/components/app/Primitives";
import { maskPhone } from "@/lib/masks";

export function PhoneNumbersField({
  numbers,
  defaultNumber,
  onChange,
}: {
  numbers: string[];
  defaultNumber?: string | null;
  onChange: (numbers: string[], defaultNumber: string) => void;
}) {
  const rows = numbers.length ? numbers : ["+92"];
  const activeDefault = defaultNumber && rows.includes(defaultNumber) ? defaultNumber : rows[0];

  const update = (index: number, value: string) => {
    const masked = maskPhone(value);
    const next = rows.map((number, row) => (row === index ? masked : number));
    let nextDefault = activeDefault;
    if (activeDefault === rows[index]) {
      nextDefault = masked;
    } else if (nextDefault && !next.includes(nextDefault)) {
      nextDefault = next[0] ?? "";
    }
    onChange(next, nextDefault);
  };
  return (
    <div className="space-y-2">
      {rows.map((number, index) => (
          <div className="flex items-center gap-2" key={index}>
          <TextInput value={number} maxLength={15} onChange={(event) => update(index, event.target.value)} />
          <button type="button" aria-label="Use as default phone" title="Use as default phone" onClick={() => onChange(rows, number)} className={"grid h-10 w-10 shrink-0 place-items-center rounded-md " + (activeDefault === number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Star size={16} /></button>
          {rows.length > 1 ? <button type="button" aria-label="Remove phone" title="Remove phone" onClick={() => { const next = rows.filter((_, row) => row !== index); onChange(next, activeDefault === number ? (next[0] ?? "") : (activeDefault ?? next[0] ?? "")); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700"><Trash2 size={16} /></button> : null}
        </div>
      ))}
      <button type="button" aria-label="Add phone number" title="Add phone number" onClick={() => onChange([...rows, "+92"], activeDefault ?? rows[0] ?? "")} className="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary"><Plus size={18} /></button>
    </div>
  );
}
