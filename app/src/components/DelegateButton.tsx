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
 * whole-madrasa or scoped to one class. Editing a scope preserves every grant
 * outside that exact screen/scope combination.
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

export function DelegateModal({ modules, initialTeacherUserId, onClose }: Readonly<{ modules?: string[]; initialTeacherUserId?: string; onClose: () => void }>) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [teacherUserId, setTeacherUserId] = useState(initialTeacherUserId ?? "");
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
    () => modules ? catalog.filter((p) => modules.includes(p.module)) : catalog,
    [catalog, modules]
  );

  useEffect(() => {
    setExisting([]);
    if (!teacherUserId) return;
    void authApi.userPermissions(teacherUserId).then((grants) => {
      setExisting(grants);
    }).catch(() => setExisting([]));
  }, [teacherUserId]);

  useEffect(() => {
    setSelected(new Set(
      relevant
        .filter((permission) => existing.some((grant) =>
          grant.permission_code === permission.code
          && grant.scope_type === (permission.scoped && scopeClassId ? "class" : null)
          && grant.scope_id === (permission.scoped && scopeClassId ? scopeClassId : null)
        ))
        .map((permission) => permission.code)
    ));
  }, [existing, relevant, scopeClassId]);

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
      const definitions = new Map(relevant.map((permission) => [permission.code, permission]));
      // Preserve grants outside this screen and scoped grants belonging to a
      // different class. Non-scopable permissions are always edited globally.
      const untouched = existing
        .filter((grant) => {
          const permission = definitions.get(grant.permission_code);
          if (!permission) return true;
          if (!permission.scoped) return false;
          const activeType = scopeClassId ? "class" : null;
          const activeId = scopeClassId || null;
          return grant.scope_type !== activeType || grant.scope_id !== activeId;
        })
        .map((g) => ({
          code: g.permission_code,
          scope_type: (g.scope_type as "class" | "section" | null) ?? undefined,
          scope_id: g.scope_id ?? undefined,
        }));
      const updated = [...selected].map((code) => {
        const permission = definitions.get(code);
        return {
          code,
          ...(permission?.scoped && scopeClassId
            ? { scope_type: "class" as const, scope_id: scopeClassId }
            : {}),
        };
      });
      const next = [...untouched, ...updated];
      await authApi.setGrants(teacherUserId, next);
      setExisting(next.map((grant) => ({
        permission_code: grant.code,
        scope_type: grant.scope_type ?? null,
        scope_id: grant.scope_id ?? null,
        granted_by_id: "",
        created_at: "",
      })));
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
            {relevant.some((permission) => permission.scoped) && (
              <label style={{ display: "block", marginBottom: 12 }}>
                {t("delegateScopeLabel")}
                <Select value={scopeClassId} onChange={(e) => setScopeClassId(e.target.value)}>
                  <option value="">{t("wholeMadrasaOption")}</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </label>
            )}

            <div className="delegateList">
              {relevant.map((p) => (
                <label key={p.code} className="checkboxLabel">
                  <input type="checkbox" checked={selected.has(p.code)} onChange={() => toggle(p.code)} />
                  <span>
                    {p.label} <small className="notice">({p.code})</small>
                    {!p.scoped && <small className="notice"> · {t("madrasaWideOnly")}</small>}
                  </span>
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
