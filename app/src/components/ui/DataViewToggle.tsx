import { useEffect, useState } from "react";
import { ToggleButton } from "./Mui";
import { ToggleButtonGroup } from "./Mui";
import { styled } from "@mui/material/styles";
import { LayoutGrid, LayoutList } from "lucide-react";

export type ViewMode = "cards" | "table";

interface DataViewToggleProps {
  viewKey: string;
  onChange?: (mode: ViewMode) => void;
  defaultMode?: ViewMode;
}

const StyledToggleGroup = styled(ToggleButtonGroup)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: 999,
  padding: 4,
  "& .MuiToggleButton-root": {
    border: "none",
    borderRadius: 999,
    padding: "6px 16px",
    fontWeight: 600,
    fontSize: "0.8rem",
    color: theme.palette.text.secondary,
    "&.Mui-selected": {
      backgroundColor: theme.palette.teal.main,
      color: theme.palette.teal.contrastText,
      "&:hover": {
        backgroundColor: theme.palette.teal.dark,
      },
    },
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

export function DataViewToggle({ viewKey, onChange, defaultMode = "cards" }: DataViewToggleProps) {
  const storageKey = `dataView:${viewKey}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(storageKey);
    return (stored === "table" || stored === "cards") ? stored : defaultMode;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, mode);
    onChange?.(mode);
  }, [mode, storageKey, onChange]);

  return (
    <StyledToggleGroup
      value={mode}
      exclusive
      onChange={(_, value) => { if (value) setMode(value); }}
      aria-label="data view mode"
    >
      <ToggleButton value="cards" aria-label="cards view">
        <LayoutGrid size={16} />
      </ToggleButton>
      <ToggleButton value="table" aria-label="table view">
        <LayoutList size={16} />
      </ToggleButton>
    </StyledToggleGroup>
  );
}
