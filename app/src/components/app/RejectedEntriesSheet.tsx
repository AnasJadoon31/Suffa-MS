import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AttendanceStatus } from "@/lib/mms/endpoints";
import {
  discardAllRejectedOutboxEntries,
  discardRejectedOutboxEntry,
  editAndRetryOutboxEntry,
  getRejectedOutboxEntries,
  retryRejectedOutboxEntry,
} from "@/lib/mms/outbox";
import {
  discardAllRejectedMutations,
  discardRejectedMutation,
  getRejectedMutations,
  retryRejectedMutation,
  type QueuedMutation,
} from "@/lib/mms/mutationQueue";
import type { OutboxEntry } from "@/lib/mms/db";

const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "leave"];

export function RejectedEntriesSheet({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  const [mutations, setMutations] = useState<QueuedMutation[]>([]);
  const [draftStatus, setDraftStatus] = useState<Record<string, AttendanceStatus>>({});

  const reload = useCallback(async () => {
    const [outbox, queued] = await Promise.all([
      getRejectedOutboxEntries(),
      getRejectedMutations(),
    ]);
    setOutboxEntries(outbox);
    setMutations(queued);
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const afterChange = async () => {
    await reload();
    onChanged();
  };

  const isEmpty = outboxEntries.length === 0 && mutations.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t("Couldn't be saved")}</SheetTitle>
          <SheetDescription>
            {t("These changes were rejected by the server. Discard them, or correct and retry.")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-3">
          {isEmpty ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("Nothing to review")}
            </p>
          ) : null}

          {outboxEntries.map((item) => {
            const key = item.idempotency_key;
            const currentStatus = draftStatus[key] ?? item.entry.status;
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {t("Attendance")} · {item.entry.attendance_date}
                  </p>
                  <Select
                    value={currentStatus}
                    onValueChange={(value) =>
                      setDraftStatus((prev) => ({ ...prev, [key]: value as AttendanceStatus }))
                    }
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {item.error ? <p className="mt-1 text-xs text-destructive">{item.error}</p> : null}
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void discardRejectedOutboxEntry(key).then(afterChange)}
                  >
                    {t("Discard")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void editAndRetryOutboxEntry(key, { status: currentStatus }).then(afterChange)
                    }
                  >
                    {t("Save & retry")}
                  </Button>
                </div>
              </div>
            );
          })}

          {mutations.map((item) => (
            <div key={item.idempotency_key} className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold">
                {item.method} {item.url}
              </p>
              {item.error ? <p className="mt-1 text-xs text-destructive">{item.error}</p> : null}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void discardRejectedMutation(item.idempotency_key).then(afterChange)
                  }
                >
                  {t("Discard")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void retryRejectedMutation(item.idempotency_key).then(afterChange)}
                >
                  {t("Retry")}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {isEmpty ? null : (
          <SheetFooter className="mt-4">
            <Button
              variant="destructive"
              onClick={() =>
                void Promise.all([
                  discardAllRejectedOutboxEntries(),
                  discardAllRejectedMutations(),
                ]).then(afterChange)
              }
            >
              {t("Discard all")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
