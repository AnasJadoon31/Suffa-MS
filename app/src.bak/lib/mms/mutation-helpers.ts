import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

export async function applyMutationSuccess({
  client,
  message,
  queryKeys,
  afterSuccess,
}: {
  client: QueryClient;
  message: string;
  queryKeys: QueryKey[];
  afterSuccess?: () => void | Promise<void>;
}) {
  toast.success(message);
  await afterSuccess?.();
  await Promise.all(queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
}
