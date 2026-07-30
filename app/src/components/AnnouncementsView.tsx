import { Button, PrimaryButton, SecondaryButton, DangerButton, IconButton, TableAction } from "./ui/Button";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../lib/DialogContext";

import { operationsApi, type Announcement, type Scope } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { RichTextEditor } from "./RichTextEditor";
import { Input, Select } from "./ui/Field";
import { ErrorState, LoadingState } from "./ui/AsyncState";
import { useSessionReadOnly } from "./SessionSwitcher";
import { Modal, FormModal } from "./ui/Modal";
import { PageSection, PageHeader } from "./ui/Layout";
import { InlineFilter } from "./ui/InlineFilter";
import { FormStack, FormRow, FormField } from "./ui/FormLayout";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import { styled } from "@mui/material/styles";

const AnnouncementCard = styled(Paper)(({ theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  marginBottom: theme.spacing(1.5),
  padding: theme.spacing(2),
  cursor: "pointer",
  transition: "background-color 0.15s ease",
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));

const AnnouncementHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 1,
}));

const AnnouncementBody = styled(Box)(({ theme }) => ({
  marginTop: "1rem",
  marginLeft: 24,
}));

const AnnouncementMeta = styled(Box)(({ theme }) => ({
  marginTop: "1rem",
  color: theme.palette.text.secondary,
  fontSize: "0.85rem",
}));

const AnnouncementActions = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: 0.5,
  marginTop: "0.5rem",
}));

const Badge = styled(Chip)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.saffron.light : theme.palette.saffron.light,
  color: theme.palette.saffron.contrastText,
  fontWeight: 600,
  fontSize: "0.75rem",
}));

function toScope(audience: string): Scope {
  if (audience === "students") return { all: false, classes: [], roles: ["student"] };
  if (audience === "teachers") return { all: false, classes: [], roles: ["teacher"] };
  return { all: true, classes: [], roles: [] };
}

function fromScope(scope: Scope): string {
  if (scope.roles?.includes("student")) return "students";
  if (scope.roles?.includes("teacher")) return "teachers";
  return "all";
}

const audienceLabelKey: Record<string, string> = { all: "audienceEveryone", teachers: "teachers", students: "students" };

export function AnnouncementsView() {
  const { t } = useTranslation();
  const { confirm, alert } = useDialog();
  const { hasPermission } = useAuth();
  const readOnly = useSessionReadOnly();
  const canPost = !readOnly && hasPermission("announcements.post");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: "", body: "", category: "", attachment_link: "", audience: "all", publish_at: "", expires_at: "" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "", category: "", attachment_link: "", audience: "all", publish_at: "", expires_at: "" });
  const [editError, setEditError] = useState("");
  const [tab, setTab] = useState<"all" | "teachers" | "students">("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dates, setDates] = useState({ date_from: "", date_to: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const knownCategories = useMemo(
    () => [...new Set(announcements.map((a) => a.category).filter(Boolean))] as string[],
    [announcements]
  );

  const load = async () => {
    setIsLoading(true);
    try {
      const params: Parameters<typeof operationsApi.listAnnouncements>[0] = {};
      if (canPost && tab !== "all") params.audience = tab;
      if (search) params.q = search;
      if (categoryFilter) params.category = categoryFilter;
      if (dates.date_from) params.date_from = dates.date_from;
      if (dates.date_to) params.date_to = dates.date_to;
      setAnnouncements(await operationsApi.listAnnouncements(params));
      setLoadError("");
    } catch (err: any) {
      setLoadError(err.response?.data?.detail ?? t("failedLoadAnnouncements"));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, categoryFilter, dates]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title || !form.body) return;
    try {
      await operationsApi.createAnnouncement({
        title: form.title,
        body: form.body,
        category: form.category || undefined,
        attachment_link: form.attachment_link || undefined,
        audience_scope: toScope(form.audience),
        publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : undefined,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
      });
      setForm({ title: "", body: "", category: "", attachment_link: "", audience: "all", publish_at: "", expires_at: "" });
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedPostAnnouncement"));
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    if (!editId || !editForm.title || !editForm.body) return;
    try {
      await operationsApi.updateAnnouncement(editId, {
        title: editForm.title,
        body: editForm.body,
        category: editForm.category || undefined,
        attachment_link: editForm.attachment_link || undefined,
        audience_scope: toScope(editForm.audience),
        publish_at: editForm.publish_at ? new Date(editForm.publish_at).toISOString() : undefined,
        expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : undefined,
      });
      setEditId(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? t("failedUpdateAnnouncement"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm(t("deleteAnnouncementConfirm")))) return;
    setError("");
    try {
      await operationsApi.deleteAnnouncement(id);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? t("failedDeleteAnnouncement"));
    }
  };

  return (
    <PageSection>
      <PageHeader
        title={t("announcementsHeading")}
        notice={t("announcementsSubtitle")}
        actions={canPost ? <PrimaryButton type="button" onClick={() => setShowCreate(true)}><Plus size={16} /> {t("postAnnouncementBtn")}</PrimaryButton> : null}
      />

      {canPost && showCreate && (
        <FormModal
          title={t("postAnnouncementBtn")} onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          submitLabel={t("postAnnouncementBtn")}
          submitIcon={<Plus size={16} />}
        >
          <FormStack>
            <FormField label={t("titleLabel")}>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </FormField>
            <FormRow>
              <FormField label={t("targetAudienceLabel")}>
                <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  <option value="all">{t("audienceEveryone")}</option>
                  <option value="teachers">{t("teachers")}</option>
                  <option value="students">{t("students")}</option>
                </Select>
              </FormField>
              <FormField label={t("announcementCategoryLabel")}>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t("announcementCategoryPlaceholder") ?? ""} list="announcement-categories" />
              </FormField>
            </FormRow>
            <FormField label={t("attachmentLinkLabel")}>
              <Input value={form.attachment_link} onChange={(e) => setForm({ ...form, attachment_link: e.target.value })} placeholder={t("optionalPlaceholder")} />
            </FormField>
            <FormRow>
              <FormField label={t("publishAtLabel")}>
                <Input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} />
              </FormField>
              <FormField label={t("expiresAtLabel")}>
                <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </FormField>
            </FormRow>
            <FormField label={t("bodyLabel")}>
              <RichTextEditor
                value={form.body}
                onChange={(html) => setForm({ ...form, body: html })}
                placeholder={t("announcementContentPlaceholder")}
              />
            </FormField>
          </FormStack>
        </FormModal>
      )}
      {error && <Alert severity="error" sx={{ mb: 1 }}><Typography>{error}</Typography></Alert>}
      <datalist id="announcement-categories">
        {knownCategories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <InlineFilter filters={[
        ...(canPost ? [{ key: "audience", type: "tab" as const, value: tab, options: [
          { value: "all", label: t("audienceEveryone") },
          { value: "teachers", label: t("teachers") },
          { value: "students", label: t("students") },
        ], onChange: (value: string) => setTab(value as typeof tab) }] : []),
        { key: "search", type: "input", inputType: "search", value: search, placeholder: t("searchAnnouncementsPlaceholder"), onChange: setSearch },
        { key: "category", type: "select", value: categoryFilter, placeholder: t("allCategories"), options: knownCategories.map((category) => ({ value: category, label: category })), onChange: setCategoryFilter },
        { key: "date-from", type: "input", inputType: "date", label: t("fromLabel"), value: dates.date_from, onChange: (value) => setDates({ ...dates, date_from: value }) },
        { key: "date-to", type: "input", inputType: "date", label: t("toLabel"), value: dates.date_to, onChange: (value) => setDates({ ...dates, date_to: value }) },
      ]} />

      <Box>
        {isLoading && <LoadingState />}
        {!isLoading && loadError && <ErrorState message={loadError} />}
        {!isLoading && !loadError && announcements.length === 0 && <Typography color="text.secondary">{t("noAnnouncementsListYet")}</Typography>}
        {!isLoading && !loadError && announcements.map((a) => (
          <AnnouncementCard key={a.id} onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Box sx={{ flex: 1 }}>
                <AnnouncementHeader>
                  {expandedId === a.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <strong><Megaphone size={14} /> {a.title}</strong>
                  {a.category && <Badge size="small" label={a.category} />}
                </AnnouncementHeader>
                
                {expandedId === a.id ? (
                  <AnnouncementBody>
                    <div dangerouslySetInnerHTML={{ __html: a.body }} />
                    {a.attachment_link && (
                      <Box sx={{ mt: 1 }}>
                        <Box component="a" href={a.attachment_link} target="_blank" rel="noreferrer" sx={{ fontWeight: 500 }}>{t("viewAttachmentLink")}</Box>
                      </Box>
                    )}
                    <AnnouncementMeta>
                      {t("announcementAudienceLine", { audience: t(audienceLabelKey[fromScope(a.audience_scope)]) })}
                    </AnnouncementMeta>
                  </AnnouncementBody>
                ) : (
                  <Box sx={{ ml: 3, color: "text.secondary", fontSize: "0.9rem", mt: 0.5 }}>
                    {a.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)}...
                  </Box>
                )}
              </Box>
              
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{new Date(a.created_at).toLocaleString()}</Typography>
                {canPost && expandedId === a.id && (
                  <AnnouncementActions onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      onClick={() => {
                        setEditId(a.id);
                        setEditForm({
                          title: a.title,
                          body: a.body,
                          category: a.category || "",
                          attachment_link: a.attachment_link || "",
                          audience: fromScope(a.audience_scope),
                          publish_at: a.publish_at ? new Date(a.publish_at).toISOString().slice(0, 16) : "",
                          expires_at: a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : "",
                        });
                      }}
                      title={t("editBtn")}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      type="button"
                      color="error"
                      onClick={() => handleDelete(a.id)}
                      title={t("deleteBtn")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </AnnouncementActions>
                )}
              </Box>
            </Box>
          </AnnouncementCard>
        ))}
      </Box>

      {editId && (
        <FormModal
          title={t("editAnnouncementHeading")}
          onClose={() => setEditId(null)}
          onSubmit={handleUpdate}
          submitLabel={t("saveChangesBtn")}
          error={editError}
        >
          <FormStack>
            <FormField label={t("titleLabel")}>
              <Input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </FormField>
            <FormRow>
              <FormField label={t("targetAudienceLabel")}>
                <Select value={editForm.audience} onChange={(e) => setEditForm({ ...editForm, audience: e.target.value })}>
                  <option value="all">{t("audienceEveryone")}</option>
                  <option value="teachers">{t("teachers")}</option>
                  <option value="students">{t("students")}</option>
                </Select>
              </FormField>
              <FormField label={t("announcementCategoryLabel")}>
                <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} list="announcement-categories" />
              </FormField>
            </FormRow>
            <FormField label={t("attachmentLinkLabel")}>
              <Input value={editForm.attachment_link} onChange={(e) => setEditForm({ ...editForm, attachment_link: e.target.value })} />
            </FormField>
            <FormRow>
              <FormField label={t("publishAtLabel")}>
                <Input type="datetime-local" value={editForm.publish_at} onChange={(e) => setEditForm({ ...editForm, publish_at: e.target.value })} />
              </FormField>
              <FormField label={t("expiresAtLabel")}>
                <Input type="datetime-local" value={editForm.expires_at} onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })} />
              </FormField>
            </FormRow>
            <FormField label={t("bodyLabel")}>
              <RichTextEditor
                value={editForm.body}
                onChange={(html) => setEditForm({ ...editForm, body: html })}
              />
            </FormField>
          </FormStack>
        </FormModal>
      )}
    </PageSection>
  );
}
