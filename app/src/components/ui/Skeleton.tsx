import { styled, keyframes } from "@mui/material/styles";
import Box from "@mui/material/Box";

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
`;

const SkeletonBase = styled("div")(({ theme }) => ({
  background: theme.palette.mode === "dark"
    ? `linear-gradient(90deg, ${theme.palette.background.paper} 0%, ${theme.palette.divider} 50%, ${theme.palette.background.paper} 100%)`
    : `linear-gradient(90deg, ${theme.palette.divider} 0%, ${theme.palette.background.default} 50%, ${theme.palette.divider} 100%)`,
  backgroundSize: "200px 100%",
  animation: `${shimmer} 1.5s ease-in-out infinite`,
  borderRadius: 8,
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
}));

export function SkeletonText({ width = "100%", height = 16 }: { width?: number | string; height?: number }) {
  return <SkeletonBase sx={{ width, height }} />;
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
      <SkeletonBase sx={{ width: "60%", height: 20, marginBottom: 12 }} />
      <SkeletonBase sx={{ width: "100%", height: 14, marginBottom: 8 }} />
      <SkeletonBase sx={{ width: "80%", height: 14, marginBottom: 8 }} />
      <SkeletonBase sx={{ width: "40%", height: 14 }} />
    </Box>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <SkeletonBase sx={{ width: size, height: size, borderRadius: "50%" }} />;
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBase key={i} sx={{ flex: 1, height: 16 }} />
        ))}
      </Box>
      {Array.from({ length: rows }).map((_, row) => (
        <Box key={row} sx={{ display: "flex", gap: 2, mb: 1.5 }}>
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonBase key={col} sx={{ flex: 1, height: 14 }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {Array.from({ length: fields }).map((_, i) => (
        <Box key={i}>
          <SkeletonBase sx={{ width: "30%", height: 14, marginBottom: 8 }} />
          <SkeletonBase sx={{ width: "100%", height: 44 }} />
        </Box>
      ))}
    </Box>
  );
}
