import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Shield, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { FormSheet } from "@/components/app/FormSheet";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  SectionTitle,
  SkeletonList,
  TextInput,
} from "@/components/app/Primitives";
import { useAuth } from "@/lib/mms/auth";
import { authApi } from "@/lib/mms/endpoints";
import { permissionsApi, rolesApi, type PermissionRole } from "@/lib/mms/more-endpoints";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "Roles — Suffa MS" },
      { name: "description", content: "Manage permission roles and assign them to teachers." },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const canManage = user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate;

  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
  });

  const [name, setName] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [editingRole, setEditingRole] = useState<PermissionRole | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const resetForm = () => {
    setEditingRole(null);
    setName("");
    setSelectedCodes([]);
  };

  const create = useMutation({
    mutationFn: () => rolesApi.create({ name: name.trim(), permission_codes: selectedCodes }),
    onSuccess: () => {
      toast.success("Role created");
      resetForm();
      setSheetOpen(false);
      void client.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingRole) return;
      return rolesApi.update(editingRole.id, {
        name: name.trim() || undefined,
        permission_codes: selectedCodes,
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
      resetForm();
      setSheetOpen(false);
      void client.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => {
      toast.success("Role deleted");
      void client.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  return (
    <AppShell
      title={t("Roles")}
      subtitle={t("Permission roles for teachers")}
      right={
        canManage ? (
          <FormSheet
            title={editingRole ? "Edit role" : "New role"}
            triggerLabel="Add"
            submitLabel={editingRole ? "Save" : "Create"}
            open={sheetOpen}
            onOpenChange={(next) => {
              setSheetOpen(next);
              if (!next) resetForm();
            }}
            onSubmit={async () => {
              if (editingRole) await update.mutateAsync();
              else await create.mutateAsync();
            }}
          >
            <Field label={t("Role name *")}>
              <TextInput
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <SectionTitle>{t("Permissions")}</SectionTitle>
            <PermissionPicker
              selected={selectedCodes}
              onChange={setSelectedCodes}
            />
          </FormSheet>
        ) : undefined
      }
    >
      {roles.isLoading ? <SkeletonList rows={4} /> : null}
      {roles.data?.length === 0 ? (
        <EmptyState title={t("No roles yet")} hint={t("Create roles to assign permission sets to teachers")} />
      ) : null}

      <div className="space-y-2">
        {roles.data?.map((role) => (
          <Card key={role.id} className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0" onClick={() => { if (canManage) { setEditingRole(role); setName(role.name); setSelectedCodes(role.permission_codes); setSheetOpen(true); } }}>
                <p className="font-semibold">{role.name}</p>
                <p className="text-xs text-muted-foreground">
                  {role.permission_codes.length} permissions · {role.user_count} users
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditingRole(role); setName(role.name); setSelectedCodes(role.permission_codes); setSheetOpen(true); }}
                    className="rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteRole.mutate(role.id)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
            {role.permission_codes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {role.permission_codes.map((code) => (
                  <span key={code} className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
                    {code}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function PermissionPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const perms = useQuery({
    queryKey: ["permissions-registry"],
    queryFn: () => permissionsApi.list(),
  });

  const toggle = (code: string) => {
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    );
  };

  return (
    <div className="max-h-60 space-y-1 overflow-y-auto">
      {perms.data?.map((perm) => (
        <button
          key={perm.code}
          type="button"
          onClick={() => toggle(perm.code)}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
            selected.includes(perm.code)
              ? "bg-primary-soft text-primary font-semibold"
              : "hover:bg-muted"
          }`}
        >
          <Shield className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t(perm.label)}</span>
          {selected.includes(perm.code) ? "✓" : ""}
        </button>
      ))}
    </div>
  );
}