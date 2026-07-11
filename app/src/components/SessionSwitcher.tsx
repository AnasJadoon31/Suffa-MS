import { useEffect, useState } from "react";
import { academicsApi, type AcademicSession } from "../lib/endpoints";
import { Select } from "./ui/Field";


export function SessionSwitcher() {
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    academicsApi.listSessions().then((data) => {
      setSessions(data);
      const stored = localStorage.getItem("mms_session_id");
      if (stored && data.some(s => s.id === stored)) {
        setSelectedId(stored);
      } else {
        const active = data.find((s) => s.is_active);
        if (active) {
          setSelectedId(active.id);
          localStorage.setItem("mms_session_id", active.id);
        }
      }
    }).catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    if (newId) {
      localStorage.setItem("mms_session_id", newId);
      setSelectedId(newId);
      // Reload to ensure all components refetch their data with the new session header
      window.location.reload();
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Select
      className="inputField"
      value={selectedId}
      onChange={handleChange}
      style={{ padding: "4px 8px", fontSize: "0.85rem", minHeight: "32px", height: "auto", width: "auto", marginRight: "8px" }}
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} {s.is_active ? "(Active)" : ""}
        </option>
      ))}
    </Select>
  );
}
