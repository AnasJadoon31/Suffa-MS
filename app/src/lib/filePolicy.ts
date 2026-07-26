const DOCUMENT_MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  odt: ["application/vnd.oasis.opendocument.text"],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  txt: ["text/plain"],
  csv: ["text/csv", "application/csv"],
  rtf: ["application/rtf", "text/rtf"],
  md: ["text/markdown", "text/plain"],
};

const DOCUMENT_EXTENSIONS = Object.keys(DOCUMENT_MIME_BY_EXTENSION);

export const DOCUMENT_UPLOAD_ACCEPT = [
  ...DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`),
  ...new Set(Object.values(DOCUMENT_MIME_BY_EXTENSION).flat()),
].join(",");

export function getDocumentUploadContentType(file: File): string | null {
  const suffix = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
  if (!suffix) return null;
  const allowed = DOCUMENT_MIME_BY_EXTENSION[suffix];
  if (!allowed) return null;
  if (!file.type) return allowed[0];
  return allowed.includes(file.type) ? file.type : null;
}
