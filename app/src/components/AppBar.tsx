import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import MuiAppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import { Menu, CalendarDays, Languages } from "lucide-react";
import { navItems, portalRoutes } from "../data/mockData";
import { useAuth } from "../lib/AuthContext";
import { useNavigate, useLocation } from "react-router";

const StyledAppBar = styled(MuiAppBar)(({ theme }) => ({
  position: "sticky",
  top: 0,
  zIndex: theme.zIndex.appBar,
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  boxShadow: "none",
  borderBottom: `1px solid ${theme.palette.divider}`,
  [theme.breakpoints.up(768)]: {
    display: "none",
  },
}));

const StyledToolbar = styled(Toolbar)({
  minHeight: 56,
  paddingInline: 12,
  gap: 8,
});

const TitleArea = styled("div")({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

const ActionsArea = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 4,
});

const DateChipStyled = styled(Chip)(({ theme }) => ({
  height: 28,
  borderRadius: 999,
  fontSize: "0.7rem",
  fontWeight: 500,
  color: theme.palette.text.secondary,
  backgroundColor: theme.palette.background.default,
  "& .MuiChip-icon": {
    fontSize: 14,
    marginLeft: 6,
    color: theme.palette.text.secondary,
  },
  [theme.breakpoints.down(400)]: {
    width: 28,
    padding: 0,
    "& .MuiChip-label": {
      display: "none",
    },
    "& .MuiChip-icon": {
      marginLeft: 0,
    },
  },
}));

const AvatarStyled = styled(Avatar)(({ theme }) => ({
  width: 32,
  height: 32,
  fontSize: "0.75rem",
  fontWeight: 600,
  backgroundColor: theme.palette.teal?.main ?? theme.palette.primary.main,
  color: theme.palette.teal?.contrastText ?? theme.palette.primary.contrastText,
  cursor: "pointer",
}));

const LanguageButton = styled(IconButton)({
  width: 36,
  height: 36,
});

const DateLabel = styled("span")({
  display: "flex",
  flexDirection: "column",
  lineHeight: 1.2,
});

export type AppBarProps = Readonly<{
  onMenuClick?: () => void;
  today?: { gregorian: string; hijri: string } | null;
}>;

function initialsOf(name: string): string {
  const parts = name.replace(/[._-]+/g, " ").trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function AppBar({ onMenuClick, today }: AppBarProps) {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isUrdu = i18n.language === "ur";

  const activeRoute = portalRoutes.find((route) => route.path === location.pathname);
  const activeView = activeRoute?.view;
  const activeItem = navItems.find((item) => item.id === activeView);

  const toggleLanguage = async () => {
    const language = isUrdu ? "en" : "ur";
    await i18n.changeLanguage(language);
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    await updateProfile({ preferred_language: language });
  };

  return (
    <StyledAppBar position="sticky">
      <StyledToolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label={t("openMenu")}
          onClick={onMenuClick}
          sx={{ width: 40, height: 40 }}
        >
          <Menu size={20} />
        </IconButton>
        <TitleArea>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {activeItem ? t(activeItem.labelKey) : t("appName")}
          </Typography>
          {activeItem && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {t(activeItem.descKey)}
            </Typography>
          )}
        </TitleArea>
        <ActionsArea>
          {today && (
            <DateChipStyled
              icon={<CalendarDays size={14} />}
              label={
                <DateLabel>
                  <strong>{today.gregorian}</strong>
                  <small>{today.hijri}</small>
                </DateLabel>
              }
              title={t("todayLabel")}
            />
          )}
          <LanguageButton color="inherit" onClick={() => void toggleLanguage()} aria-label="Toggle language">
            <Languages size={18} />
          </LanguageButton>
          {user && (
            <AvatarStyled
              onClick={() => navigate("/my-profile")}
              title={t("myProfile")}
              aria-label={`${t("myProfile")}: ${user.username}`}
            >
              {initialsOf(user.username)}
            </AvatarStyled>
          )}
        </ActionsArea>
      </StyledToolbar>
    </StyledAppBar>
  );
}
