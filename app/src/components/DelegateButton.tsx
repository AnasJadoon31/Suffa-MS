import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  academicsApi,
  authApi,
  peopleApi,
  type AcademicClass,
  type PermissionDef,
  type PermissionGrant,
  type Teacher,
} from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { Select } from "./ui/Field";

/**
 * "Mini-admin" delegation (IMPLEMENT.md §3): principals drop this button into
 * any screen header to grant that screen's feature codes to a teacher —
 * whole-madrasa or scoped to one class. Grants replace the teacher's full
 * grant set, so the modal loads existing grants first and edits on top.
 */
export function DelegateButton({ modules }: Readonly<{ modules: string[] }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (user?.role !== "principal") return null;

  return (
    <>
      <button className="secondaryAction" type="button" onClick={() => setOpen(true)}>
        <ShieldCheck size={16} /> {t("delegateBtn")}
      </button>
      {open && <DelegateModal modules={modules} onClose={() => setOpen(false)} />}
    </>
  );
}

function DelegateModal({ modules, onClose }: Readonly<{ modules: string[]; onClose: () => void }>) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [teacherUserId, setTeacherUserId] = useState("");
  const [existing, setExisting] = useState<PermissionGrant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scopeClassId, setScopeClassId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void authApi.permissionCatalog().then(setCatalog).catch(() => setCatalog([]));
    void peopleApi.listTeachers().then(setTeachers).catch(() => setTeachers([]));
    void academicsApi.listClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  const relevant = useMemo(
    () => catalog.filter((p) => modules.includes(p.module)),
    [catalog, modules]
  );

  useEffect(() => {
    setSelected(new Set());
    setExisting([]);
    if (!teacherUserId) return;
    void authApi.userPermissions(teacherUserId).then((grants) => {
      setExisting(grants);
      setSelected(new Set(
        grants
          .filter((g) => g.scope_type === null && relevant.some((p) => p.code === g.permission_code))
          .map((g) => g.permission_code)
      ));
    }).catch(() => setExisting([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherUserId, relevant.length]);

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const save = async () => {
    setError("");
    setNotice("");
    try {
      // Preserve every grant outside this screen's modules untouched.
      const untouched = existing
        .filter((g) => !relevant.some((p) => p.code === g.permission_code))
        .map((g) => ({
          code: g.permission_code,
          scope_type: (g.scope_type as "class" | "section" | null) ?? undefined,
          scope_id: g.scope_id ?? undefined,
        }));
      const updated = [...selected].map((code) => ({
        code,
        ...(scopeClassId ? { scope_type: "class" as const, scope_id: scopeClassId } : {}),
      }));
      await authApi.setGrants(teacherUserId, [...untouched, ...updated]);
      setNotice(t("delegateSaved"));
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("delegateFailed"));
    }
  };

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="moduleHeader" style={{ display: "flex", justifyContent: "space-between" }}>
          <h3>{t("delegateHeading")}</h3>
          <button className="tableAction" type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="notice">{t("delegateHint")}</p>

        <label style={{ display: "block", marginBottom: 12 }}>
          {t("teacherLabel")}
          <Select value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)}>
            <option value="">{t("selectEllipsis")}</option>
            {teachers.map((teacher) => (
              <option key={teacher.user_id} value={teacher.user_id}>{teacher.name} ({teacher.employee_code})</option>
            ))}
          </Select>
        </label>

        {teacherUserId && (
          <>
            <label style={{ display: "block", marginBottom: 12 }}>
              {t("delegateScopeLabel")}
              <Select value={scopeClassId} onChange={(e) => setScopeClassId(e.target.value)}>
                <option value="">{t("wholeMadrasaOption")}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>

            <div className="delegateList">
              {relevant.map((p) => (
                <label key={p.code} className="checkboxLabel">
                  <input type="checkbox" checked={selected.has(p.code)} onChange={() => toggle(p.code)} />
                  {p.label} <small className="notice">({p.code})</small>
                </label>
              ))}
              {relevant.length === 0 && <p className="emptyState">{t("noDelegatablePermissions")}</p>}
            </div>

            {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
            {notice && <p className="notice">{notice}</p>}
            <div className="formActions">
              <button className="primaryAction" type="button" onClick={() => void save()}>{t("saveBtn")}</button>
              <button className="secondaryAction" type="button" onClick={onClose}>{t("cancelBtn")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
