import { X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Dialog } from "./Mui";
import { DialogActions } from "./Mui";
import { DialogContent } from "./Mui";
import { DialogTitle } from "./Mui";
import { Box } from "./Mui";
import { IconButton } from "./Mui";
import { useMediaQuery } from "./Mui";
import { useTheme, styled } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { PWA_COMPACT_BREAKPOINT, PWA_TOUCH_TARGET } from "./Layout";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "fullscreenMobile";

const modalWidths: Record<Exclude<ModalSize, "fullscreenMobile">, number> = {
  sm: 420,
  md: 560,
  lg: 760,
  xl: 960,
};

export function Modal({
  title,
  onClose,
  maxWidth,
  size = "md",
  actions,
  children,
}: Readonly<{
  title: string | ReactNode;
  onClose: () => void;
  maxWidth?: number | string | Record<string, number | string>;
  size?: ModalSize;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  const titleId = useId();
  const theme = useTheme();
  const isCompact = useMediaQuery(`(max-width:${PWA_COMPACT_BREAKPOINT - 1}px)`);

  const resolvedMaxWidth = maxWidth ?? (size === "fullscreenMobile" ? modalWidths.lg : modalWidths[size]);
  const isFullscreenMobile = isCompact && size === "fullscreenMobile";

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={false}
      slotProps={{
        paper: {
          className: "modalCard",
          sx: {
            width: "100%",
            maxWidth: resolvedMaxWidth,
            margin: isCompact ? 0 : 2,
            borderRadius: isCompact ? "12px 12px 0 0" : 1.5,
            overflow: "hidden",
            ...(isCompact && {
              alignSelf: "flex-end",
              maxWidth: "100vw",
              maxHeight: isFullscreenMobile ? "100dvh" : "calc(100dvh - 24px)",
              height: isFullscreenMobile ? "100dvh" : "auto",
              marginBottom: 0,
            }),
          },
        },
      }}
      sx={{
        ...(isCompact && { alignItems: "flex-end" }),
      }}
    >
      {isCompact && !isFullscreenMobile && (
        <Box
          sx={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: "divider",
            margin: "12px auto 0",
            flexShrink: 0,
          }}
        />
      )}
      <DialogTitle id={titleId} component="div" sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, minWidth: 0 }}>
          <Box component="h3" sx={{ m: 0, fontSize: "1.05rem", lineHeight: 1.35, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>
            {title}
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {actions}
            <IconButton type="button" aria-label={t("closeBtn")} onClick={onClose} sx={{ width: PWA_TOUCH_TARGET, height: PWA_TOUCH_TARGET }}><X size={18} /></IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 2.5 }, py: 2, overflowX: "hidden" }}>{children}</DialogContent>
    </Dialog>
  );
}

export function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitIcon,
  submitDisabled,
  error,
  maxWidth,
  size,
  children
}: Readonly<{
  title: string;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  submitLabel: string;
  submitIcon?: ReactNode;
  submitDisabled?: boolean;
  error?: string | null;
  maxWidth?: number | string | Record<string, number | string>;
  size?: ModalSize;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const theme = useTheme();
  const isCompact = useMediaQuery(`(max-width:${PWA_COMPACT_BREAKPOINT - 1}px)`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      setIsSubmitting(true);
      try {
        await onSubmit(e);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal title={title} onClose={onClose} maxWidth={maxWidth} size={size}>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {error && (
          <Box component="p" sx={{ color: "error.main", margin: 0, marginBottom: 1, overflowWrap: "anywhere" }}>
            {error}
          </Box>
        )}
        {children}
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: isCompact ? "column-reverse" : "row",
            alignItems: "stretch",
            justifyContent: "flex-end",
            gap: 1,
            marginTop: 3,
            mx: { xs: -2, sm: -2.5 },
            mb: -2,
            px: { xs: 2, sm: 2.5 },
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            backgroundColor: "background.paper",
            ...(isCompact && {
              position: "sticky",
              bottom: 0,
              zIndex: 1,
            }),
            "& .MuiButton-root": {
              minHeight: PWA_TOUCH_TARGET,
            },
          }}
        >
          <Button
            type="button"
            onClick={onClose}
            sx={{ minWidth: isCompact ? "100%" : 120 }}
          >
            {t("cancelBtn")}
          </Button>
          <Button
            type="submit"
            disabled={submitDisabled}
            isLoading={isSubmitting}
            variant="contained"
            sx={{ minWidth: isCompact ? "100%" : 140 }}
          >
            {submitIcon} {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Modal>
  );
}

/* ------------------------------------------------------------------ styled components */

export const ModalCard = styled(Dialog)(({ theme }) => ({
  "& .MuiDialog-paper": {
    borderRadius: 12,
    margin: 16,
  },
}));

export const ModalHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: theme.spacing(2, 3),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const ModalBody = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  overflowY: "auto",
  flex: 1,
}));

export const ModalActions = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: theme.spacing(1.5),
  padding: theme.spacing(2, 3),
  borderTop: `1px solid ${theme.palette.divider}`,
  position: "sticky",
  bottom: 0,
  backgroundColor: theme.palette.background.paper,
  zIndex: 1,
}));
