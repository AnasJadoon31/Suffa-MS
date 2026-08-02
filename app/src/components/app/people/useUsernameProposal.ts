import { useEffect, useState } from "react";

import { peopleMutations } from "@/lib/mms/more-endpoints";

/** Auto-proposes a username from a full name until the user edits it manually. */
export function useUsernameProposal(name: string) {
  const [username, setUsername] = useState("");
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (edited || !name.trim()) return;
    const timer = window.setTimeout(() => {
      void peopleMutations
        .usernameProposal(name.trim())
        .then(setUsername)
        .catch(() => {});
    }, 300);
    return () => window.clearTimeout(timer);
  }, [name, edited]);

  return {
    username,
    setUsername: (value: string) => {
      setEdited(true);
      setUsername(value);
    },
    reset: () => {
      setUsername("");
      setEdited(false);
    },
  };
}
