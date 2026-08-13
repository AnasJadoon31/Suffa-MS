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
  const update = (index: number, value: string) => {
    const next = rows.map((number, row) => (row === index ? maskPhone(value) : number));
    onChange(next, defaultNumber && next.includes(defaultNumber) ? defaultNumber : (next[0] ?? ""));
  };
  return (
    <div className="space-y-2">
      {rows.map((number, index) => (
        <div className="flex items-center gap-2" key={`${index}-${number}`}>
          <TextInput value={number} maxLength={15} onChange={(event) => update(index, event.target.value)} />
          <button type="button" aria-label="Use as default phone" title="Use as default phone" onClick={() => onChange(rows, number)} className={"grid h-10 w-10 shrink-0 place-items-center rounded-md " + (defaultNumber === number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Star size={16} /></button>
          {rows.length > 1 ? <button type="button" aria-label="Remove phone" title="Remove phone" onClick={() => { const next = rows.filter((_, row) => row !== index); onChange(next, defaultNumber === number ? (next[0] ?? "") : (defaultNumber ?? next[0] ?? "")); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700"><Trash2 size={16} /></button> : null}
        </div>
      ))}
      <button type="button" aria-label="Add phone number" title="Add phone number" onClick={() => onChange([...rows, "+92"], defaultNumber ?? rows[0] ?? "")} className="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary"><Plus size={18} /></button>
    </div>
  );
}
