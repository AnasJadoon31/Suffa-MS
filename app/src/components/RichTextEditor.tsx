import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "./ui/Field";
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
  { labelKey: "defaultFontLabel", value: "" },
  { labelKey: "serifFontLabel", value: "Georgia" },
  { labelKey: "sansSerifFontLabel", value: "Arial" },
  { labelKey: "urduFontLabel", value: "Noto Nastaliq Urdu" },
];

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const { t } = useTranslation();
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
      <div className="richTextToolbar" role="toolbar" aria-label={t("textFormattingLabel")}>
        <button type="button" title={t("boldLabel")} onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}><Bold size={14} /></button>
        <button type="button" title={t("italicLabel")} onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}><Italic size={14} /></button>
        <button type="button" title={t("underlineLabel")} onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}><Underline size={14} /></button>
        <button type="button" title={t("headingLabel")} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2"); }}><Heading2 size={14} /></button>
        <button type="button" title={t("paragraphLabel")} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "p"); }}>¶</button>
        <button type="button" title={t("bulletedListLabel")} onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}><List size={14} /></button>
        <button type="button" title={t("numberedListLabel")} onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}><ListOrdered size={14} /></button>
        <button type="button" title={t("leftToRightLabel")} onMouseDown={(e) => { e.preventDefault(); setDirection("ltr"); }}><AlignLeft size={14} /></button>
        <button type="button" title={t("rightToLeftUrduLabel")} onMouseDown={(e) => { e.preventDefault(); setDirection("rtl"); }}><AlignRight size={14} /></button>
        <Select
          title={t("fontLabel")}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value);
          }}
        >
          {FONT_OPTIONS.map((f) => <option key={f.labelKey} value={f.value}>{t(f.labelKey)}</option>)}
        </Select>
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
