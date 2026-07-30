import { X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme, styled } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export function Modal({ title, onClose, maxWidth, actions, children }: Readonly<{ title: string | ReactNode; onClose: () => void; maxWidth?: number | string; actions?: ReactNode; children: ReactNode }>) {
  const { t } = useTranslation();
  const titleId = useId();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: "100%",
            maxWidth: maxWidth ?? 720,
            margin: isMobile ? 0 : 16,
            borderRadius: isMobile ? "20px 20px 0 0" : 20,
            ...(isMobile && { marginBottom: 0, maxHeight: "calc(100% - 48px)" }),
          },
        },
      }}
      sx={{
        ...(isMobile && { alignItems: "flex-end" }),
      }}
    >
      {isMobile && (
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
      <DialogTitle id={titleId} component="div">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <h3>{title}</h3>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {actions}
            <IconButton type="button" aria-label={t("closeBtn")} onClick={onClose} size="small"><X size={16} /></IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
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
  children
}: Readonly<{
  title: string;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  submitLabel: string;
  submitIcon?: ReactNode;
  submitDisabled?: boolean;
  error?: string | null;
  maxWidth?: number | string;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
    <Modal title={title} onClose={onClose} maxWidth={maxWidth}>
      <form onSubmit={handleSubmit}>
        {error && (
          <Box component="p" sx={{ color: "error.main", marginBottom: 1 }}>
            {error}
          </Box>
        )}
        {children}
        <Box
          sx={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: 2,
            marginTop: 3,
            paddingTop: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            ...(isMobile && {
              position: "sticky",
              bottom: 0,
              backgroundColor: "background.paper",
              marginX: -2,
              paddingX: 2,
              paddingBottom: 2,
              zIndex: 1,
            }),
          }}
        >
          <Button
            type="button"
            onClick={onClose}
            sx={{ flex: isMobile ? 1 : undefined }}
          >
            {t("cancelBtn")}
          </Button>
          <Button
            type="submit"
            disabled={submitDisabled}
            isLoading={isSubmitting}
            sx={{ flex: isMobile ? 1 : undefined }}
          >
            {submitIcon} {submitLabel}
          </Button>
        </Box>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ styled components */

export const ModalCard = styled(Dialog)(({ theme }) => ({
  "& .MuiDialog-paper": {
    borderRadius: 20,
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
