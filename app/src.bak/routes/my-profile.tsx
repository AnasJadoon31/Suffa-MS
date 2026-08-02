import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/my-profile")({
  component: () => <Navigate to="/me" replace />,
});
