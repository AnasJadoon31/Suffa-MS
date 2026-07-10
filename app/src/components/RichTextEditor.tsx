import { useEffect, useRef } from "react";
import {
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";

type RichTextEditorProps = Readonly<{
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}>;

const FONT_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Serif", value: "Georgia" },
  { label: "Sans-serif", value: "Arial" },
  { label: "Urdu (Nastaliq)", value: "Noto Nastaliq Urdu" },
];

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Only push external value in when it differs (e.g. form reset) — writing
  // innerHTML on every keystroke would reset the caret position.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  const emit = () => onChange(editorRef.current?.innerHTML ?? "");

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const setDirection = (dir: "ltr" | "rtl") => {
    if (editorRef.current) {
      editorRef.current.dir = dir;
      emit();
    }
  };

  return (
    <div className="richTextEditor">
      <div className="richTextToolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" title="Bold" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}><Bold size={14} /></button>
        <button type="button" title="Italic" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}><Italic size={14} /></button>
        <button type="button" title="Underline" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}><Underline size={14} /></button>
        <button type="button" title="Heading" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2"); }}><Heading2 size={14} /></button>
        <button type="button" title="Paragraph" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "p"); }}>¶</button>
        <button type="button" title="Bulleted list" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}><List size={14} /></button>
        <button type="button" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}><ListOrdered size={14} /></button>
        <button type="button" title="Left-to-right" onMouseDown={(e) => { e.preventDefault(); setDirection("ltr"); }}><AlignLeft size={14} /></button>
        <button type="button" title="Right-to-left (Urdu)" onMouseDown={(e) => { e.preventDefault(); setDirection("rtl"); }}><AlignRight size={14} /></button>
        <select
          title="Font"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value);
          }}
        >
          {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div
        ref={editorRef}
        className="richTextArea"
        contentEditable
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
