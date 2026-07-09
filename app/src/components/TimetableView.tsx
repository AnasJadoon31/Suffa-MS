import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";

import { academicsApi, type AcademicClass, type Course, type Section, type Teacher } from "../lib/endpoints";
import { operationsApi, type Holiday, type Leave, type TimetableSlot } from "../lib/endpoints";
import { peopleApi } from "../lib/endpoints";
import { useAuth } from "../lib/AuthContext";
import { cachedFetch } from "../lib/offlineCache";

type Tab = "timetable" | "holidays" | "leave";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function TimetableView() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>("timetable");
  const canManage = hasPermission("timetable.manage");

  return (
    <section className="modulePanel">
      <div className="moduleHeader">
        <h2>Timetable</h2>
        <p className="notice">Class schedule, holidays, and leave requests.</p>
      </div>
      <div className="formActions" style={{ marginBottom: 16 }}>
        <button className={tab === "timetable" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("timetable")}>
          <CalendarClock size={16} /> Timetable
        </button>
        <button className={tab === "holidays" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("holidays")}>
          Holidays
        </button>
        <button className={tab === "leave" ? "primaryAction" : "secondaryAction"} type="button" onClick={() => setTab("leave")}>
          Leave
        </button>
      </div>
      {tab === "timetable" && <TimetableTab canManage={canManage} />}
      {tab === "holidays" && <HolidaysTab canManage={canManage} />}
      {tab === "leave" && <LeaveTab canManage={canManage} />}
    </section>
  );
}

function TimetableTab({ canManage }: Readonly<{ canManage: boolean }>) {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [sections, setSections] = useState<Record<string, Section[]>>({});
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState({
    class_id: "", section_id: "", course_id: "", teacher_id: "", day_of_week: "0", period: "1",
    start_time: "", end_time: "",
  });
  const [error, setError] = useState("");
  const [offlineCopy, setOfflineCopy] = useState<string | null>(null);

  const load = async () => setSlots(await operationsApi.listTimetable());

  const refreshAll = async () => {
    const { data, fromCache, fetchedAt } = await cachedFetch("timetable-reference", async () => {
      const [c, t, s] = await Promise.all([
        academicsApi.listClasses(),
        peopleApi.listTeachers(),
        operationsApi.listTimetable(),
      ]);
      const secByClass: Record<string, Section[]> = {};
      const courseByClass: Record<string, Course[]> = {};
      for (const cls of c) {
        secByClass[cls.id] = await academicsApi.listSections(cls.id);
        courseByClass[cls.id] = await academicsApi.listCourses(cls.id);
      }
      return { classes: c, teachers: t, slots: s, sections: secByClass, courses: courseByClass };
    });
    setClasses(data.classes);
    setTeachers(data.teachers);
    setSlots(data.slots);
    setSections(data.sections);
    setCourses(data.courses);
    setOfflineCopy(fromCache ? fetchedAt : null);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const allCourses = Object.values(courses).flat();
  const allSections = Object.values(sections).flat();

  return (
    <>
      {canManage && (
        <form
          className="inlineForm"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const { class_id, section_id, course_id, teacher_id, day_of_week, period, start_time, end_time } = form;
            if (!class_id || !section_id || !course_id || !teacher_id || !start_time || !end_time) return;
            try {
              await operationsApi.createTimetableSlot({
                class_id, section_id, course_id, teacher_id,
                day_of_week: Number(day_of_week), period: Number(period), start_time, end_time,
              });
              setForm({ ...form, start_time: "", end_time: "" });
              await load();
            } catch (err: any) {
              setError(err.response?.data?.detail ?? "Failed to create slot");
            }
          }}
        >
          <label>
            Class
            <select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, section_id: "", course_id: "" })}>
              <option value="">Select…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Section
            <select required value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}>
              <option value="">Select…</option>
              {(sections[form.class_id] ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Course
            <select required value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
              <option value="">Select…</option>
              {(courses[form.class_id] ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Teacher
            <select required value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">Select…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>
            Day
            <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label>
            Period
            <input required type="number" min={1} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
          </label>
          <label>
            Start time
            <input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </label>
          <label>
            End time
            <input required type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </label>
          <div className="formActions">
            <button className="primaryAction" type="submit"><Plus size={16} /> Add slot</button>
          </div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      {offlineCopy && <p className="notice">Offline — showing cached timetable from {new Date(offlineCopy).toLocaleString()}.</p>}
      <div className="dataTable">
        <div className="dataRow header"><span>Day</span><span>Period</span><span>Time</span><span>Class</span><span>Course</span><span>Teacher</span><span></span></div>
        {slots.length === 0 && <p className="emptyState">No timetable slots yet.</p>}
        {slots.map((s) => (
          <div className="dataRow" key={s.id}>
            <span>{DAY_NAMES[s.day_of_week]}</span>
            <span>{s.period}</span>
            <span>{s.start_time}–{s.end_time}</span>
            <span>{classes.find((c) => c.id === s.class_id)?.name ?? "—"} / {allSections.find((sec) => sec.id === s.section_id)?.name ?? "—"}</span>
            <span>{allCourses.find((c) => c.id === s.course_id)?.name ?? "—"}</span>
            <span>{teachers.find((t) => t.id === s.teacher_id)?.name ?? "—"}</span>
            <span>
              {canManage && (
                <button className="tableAction" type="button" onClick={async () => { await operationsApi.deleteTimetableSlot(s.id); await load(); }}>
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function HolidaysTab({ canManage }: Readonly<{ canManage: boolean }>) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await cachedFetch("holidays", () => operationsApi.listHolidays());
    setHolidays(data);
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <>
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
          <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Start<input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
          <label>End<input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
          <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Add holiday</button></div>
        </form>
      )}
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header"><span>Name</span><span>Start</span><span>End</span></div>
        {holidays.length === 0 && <p className="emptyState">No holidays recorded.</p>}
        {holidays.map((h) => (
          <div className="dataRow" key={h.id}><span>{h.name}</span><span>{h.start_date}</span><span>{h.end_date}</span></div>
        ))}
      </div>
    </>
  );
}

function LeaveTab({ canManage }: Readonly<{ canManage: boolean }>) {
  const [leave, setLeave] = useState<Leave[]>([]);
  const [form, setForm] = useState({ user_id: "", start_date: "", end_date: "", reason: "" });
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await cachedFetch("leave", () => operationsApi.listLeave());
    setLeave(data);
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <form
        className="inlineForm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await operationsApi.createLeave(form);
            setForm({ user_id: "", start_date: "", end_date: "", reason: "" });
            await load();
          } catch (err: any) {
            setError(err.response?.data?.detail ?? "Failed to submit leave");
          }
        }}
      >
        <label>User ID<input required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} /></label>
        <label>Start<input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
        <label>End<input required type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
        <label>Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
        <div className="formActions"><button className="primaryAction" type="submit"><Plus size={16} /> Request leave</button></div>
      </form>
      {error && <p className="notice" style={{ color: "var(--rose)" }}>{error}</p>}
      <div className="dataTable">
        <div className="dataRow header"><span>User</span><span>Start</span><span>End</span><span>Reason</span><span>Status</span><span></span></div>
        {leave.length === 0 && <p className="emptyState">No leave records.</p>}
        {leave.map((l) => (
          <div className="dataRow" key={l.id}>
            <span>{l.user_id}</span>
            <span>{l.start_date}</span>
            <span>{l.end_date}</span>
            <span>{l.reason ?? "—"}</span>
            <span>{l.status}</span>
            <span>
              {canManage && l.status === "pending" && (
                <>
                  <button className="tableAction" type="button" onClick={async () => { await operationsApi.setLeaveStatus(l.id, "approved"); await load(); }}>
                    <CheckCircle2 size={14} />
                  </button>
                  <button className="tableAction" type="button" onClick={async () => { await operationsApi.setLeaveStatus(l.id, "rejected"); await load(); }}>
                    <XCircle size={14} />
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
