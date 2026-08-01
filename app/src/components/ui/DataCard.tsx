import { type ReactNode } from "react";
import { Card } from "./Mui";
import { CardContent } from "./Mui";
import { CardActions } from "./Mui";
import { Avatar } from "./Mui";
import { Typography } from "./Mui";
import { Box } from "./Mui";
import { Chip } from "./Mui";
import { styled } from "@mui/material/styles";

export interface DataField {
  label: string;
  value: ReactNode;
}

export interface DataCardProps {
  title: string;
  subtitle?: string;
  avatar?: ReactNode;
  fields?: DataField[];
  status?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}

const StyledCard = styled(Card)(({ theme }) => ({
  borderRadius: 8,
  marginBottom: theme.spacing(1.5),
  cursor: "default",
  overflow: "visible",
  transition: "box-shadow 0.2s ease, transform 0.15s ease",
  "&[data-clickable='true']": {
    cursor: "pointer",
  },
  "&[data-clickable='true']:hover": {
    boxShadow: theme.shadows[4],
    transform: "translateY(-1px)",
  },
}));

const CardHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1.5),
  padding: theme.spacing(2),
  paddingBottom: theme.spacing(1),
}));

const CardBody = styled(CardContent)(({ theme }) => ({
  padding: theme.spacing(1, 2, 1.5),
  "&:last-child": { paddingBottom: theme.spacing(1) },
}));

const FieldsGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: theme.spacing(1),
  marginTop: theme.spacing(0.5),
}));

const FieldItem = styled(Box)(() => ({
  display: "flex",
  flexDirection: "column",
}));

const FieldLabel = styled(Typography)(({ theme }) => ({
  fontSize: "0.7rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: theme.palette.text.secondary,
}));

const FieldValue = styled(Typography)(() => ({
  fontSize: "0.875rem",
  fontWeight: 500,
  overflowWrap: "anywhere",
}));

export function DataCard({
  title,
  subtitle,
  avatar,
  fields = [],
  status,
  actions,
  onClick,
}: DataCardProps) {
  return (
    <StyledCard className="mobileDataCard" variant="outlined" onClick={onClick} data-clickable={Boolean(onClick)}>
      <CardHeader>
        {avatar && (
          <Avatar sx={{ width: 44, height: 44, bgcolor: "teal.main", color: "teal.contrastText" }}>
            {avatar}
          </Avatar>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {status && <Chip size="small" component="span" label={status} />}
      </CardHeader>
      {fields.length > 0 && (
        <CardBody>
          <FieldsGrid>
            {fields.map((field, index) => (
              <FieldItem key={index}>
                <FieldLabel>{field.label}</FieldLabel>
                <FieldValue>{field.value}</FieldValue>
              </FieldItem>
            ))}
          </FieldsGrid>
        </CardBody>
      )}
      {actions && (
        <CardActions sx={{ px: 2, pb: 1.5, pt: 0, gap: 0.5 }}>
          {actions}
        </CardActions>
      )}
    </StyledCard>
  );
}
