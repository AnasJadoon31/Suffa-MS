import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/profile")({
  component: () => <Navigate to="/me" replace />,
});
