import { useEffect, useState } from "react";
import { styled, useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import { X, Download, Share, PlusSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

const VISIT_KEY = "mms-install-visits";
const TIME_KEY = "mms-install-time";
const DISMISS_KEY = "mms-install-dismissed";
const VISIT_THRESHOLD = 3;
const TIME_THRESHOLD = 5 * 60 * 1000; // 5 minutes

const Banner = styled(Box)(({ theme }) => ({
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1300,
  backgroundColor: theme.palette.background.paper,
  borderTop: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(2),
  display: "flex",
  alignItems: "center",
  gap: 12,
  boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
  [theme.breakpoints.up(768)]: {
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: 420,
    borderRadius: 16,
    border: `1px solid ${theme.palette.divider}`,
  },
}));

const InstructionsBox = styled(Box)(({ theme }) => ({
  position: "absolute",
  bottom: "100%",
  left: 0,
  right: 0,
  marginBottom: 8,
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
}));

function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function shouldShowPrompt(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandalone()) return false;
  if (localStorage.getItem(DISMISS_KEY) === "true") return false;

  const visits = parseInt(localStorage.getItem(VISIT_KEY) || "0", 10);
  const timeUsed = parseInt(localStorage.getItem(TIME_KEY) || "0", 10);

  return visits >= VISIT_THRESHOLD || timeUsed >= TIME_THRESHOLD;
}

function trackVisit(): void {
  if (typeof window === "undefined") return;
  const visits = parseInt(localStorage.getItem(VISIT_KEY) || "0", 10);
  localStorage.setItem(VISIT_KEY, String(visits + 1));
}

function startTimeTracking(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const interval = setInterval(() => {
    const current = parseInt(localStorage.getItem(TIME_KEY) || "0", 10);
    localStorage.setItem(TIME_KEY, String(current + 1000));
  }, 1000);
  return () => clearInterval(interval);
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);

  useEffect(() => {
    trackVisit();
    const cleanup = startTimeTracking();
    const timer = setTimeout(() => {
      if (shouldShowPrompt()) {
        setVisible(true);
      }
    }, 2000);
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "true");
  };

  if (!visible) return null;

  return (
    <Banner>
      <Download size={24} color={theme.palette.teal.main} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t("installApp", "Install Suffa-MS")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("installPromptDesc", "Add to home screen for quick access")}
        </Typography>
      </Box>
      {isIOSSafari() && (
        <Button
          size="small"
          variant="text"
          onClick={() => setIosInstructions(!iosInstructions)}
        >
          {t("howToBtn", "How?")}
        </Button>
      )}
      <IconButton size="small" onClick={handleDismiss} aria-label={t("closeBtn", "Close")}>
        <X size={16} />
      </IconButton>
      {iosInstructions && (
        <InstructionsBox>
          <Typography variant="caption" color="text.secondary">
            {t("iosInstallSteps", "Tap the Share button, then 'Add to Home Screen'")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mt: 1, justifyContent: "center" }}>
            <Share size={16} />
            <PlusSquare size={16} />
          </Box>
        </InstructionsBox>
      )}
    </Banner>
  );
}
