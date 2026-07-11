import { useEffect, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { operationsApi, type Holiday } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";
import { Input } from "./ui/Field";


type HolidayForm = {
  name: string;
  start_date: string;
  end_date: string;
};

export function HolidaysView() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("timetable.manage");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [form, setForm] = useState<HolidayForm>({ name: "", start_date: "", end_date: "" });
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<HolidayForm>({ name: "", start_date: "", end_date: "" });
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await cachedFetch("holidays", () => operationsApi.listHolidays());
    setHolidays(data);
  };

  useEffect(() => {
    void load();
  }, []);

  const startEditing = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setEditForm({ name: holiday.name, start_date: holiday.start_date, end_date: holiday.end_date });
    setError("");
  };

  const cancelEditing = () => {
    setEditingId("");
    setEditForm({ name: "", start_date: "", end_date: "" });
  };

  const saveHoliday = async (holidayId: string) => {
    setError("");
    if (!editForm.name || !editForm.start_date || !editForm.end_date) {
      setError("Name, start, and end are required");
      return;
    }
    try {
      await operationsApi.updateHoliday(holidayId, editForm);
      cancelEditing();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to update holiday");
    }
  };

  const deleteHoliday = async (holiday: Holiday) => {
    if (!window.confirm(`Delete holiday "${holiday.name}"?`)) return;
    setError("");
    try {
      await operationsApi.deleteHoliday(holiday.id);
      if (editingId === holiday.id) cancelEditing();
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to delete holiday");
    }
  };

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Holidays</h2>
        <p className="notice">Holiday calendar for attendance and operations.</p>
      </div>

      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await operationsApi.createHoliday(form);
              setForm({ name: "", start_date: "", end_date: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to add holiday");
            }
          }}
        >
          <label>Name<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Start<Input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <label>End<Input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Add holiday</button></div>
        </form>
      )}

      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}

      <div className="dataTable">
        <div className="dataRow header">
          <span>Name</span>
          <span>Start</span>
          <span>End</span>
          {canManage && <span>Actions</span>}
        </div>
        {holidays.length === 0 && <p className="emptyState">No holidays recorded.</p>}
        {holidays.map((holiday) => {
          const isEditing = editingId === holiday.id;

          return (
            <div className="dataRow" key={holiday.id}>
              <span>
                {isEditing ? (
                  <Input
                    required
                    value={editForm.name}
                    onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  />
                ) : holiday.name}
              </span>
              <span>
                {isEditing ? (
                  <Input
                    required
                    type="date"
                    value={editForm.start_date}
                    onChange={(event) => setEditForm({ ...editForm, start_date: event.target.value })}
                  />
                ) : holiday.start_date}
              </span>
              <span>
                {isEditing ? (
                  <Input
                    required
                    type="date"
                    value={editForm.end_date}
                    onChange={(event) => setEditForm({ ...editForm, end_date: event.target.value })}
                  />
                ) : holiday.end_date}
              </span>
              {canManage && (
                <span>
                  {isEditing ? (
                    <>
                      <button className="tableAction" type="button" onClick={() => void saveHoliday(holiday.id)}>
                        <Save size={14} /> Save
                      </button>
                      <button className="tableAction" type="button" onClick={cancelEditing}>
                        <X size={14} /> Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="tableAction" type="button" onClick={() => startEditing(holiday)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button className="tableAction" type="button" onClick={() => void deleteHoliday(holiday)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
