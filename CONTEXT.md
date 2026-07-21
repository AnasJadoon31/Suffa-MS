# Suffa MS domain context

## Admission Form

A reusable, administrator-authored template that defines the questions used to collect
student admission data. A form may be open or closed; both states remain selectable by an
administrator creating a student directly.

## Admission Application

A submitted candidate record produced from an Admission Form or entered as a walk-in.
Applications move between pending, accepted, and rejected. Acceptance may convert the
application into linked People records, but later status changes never delete those records.

## Student Admission Record

The immutable origin attached to a Student: source form/application links plus snapshots of
the form title, schema, and submitted answers. Snapshots preserve history when a form changes
or is deleted.

## Enrollment

A time-bounded assignment of a Student to one program, class, and section in an academic
session. Only one enrollment may be active for a student/session; unassignment ends it rather
than deleting history.

## Attendance Period

One scheduled timetable lesson identified by date and timetable slot. New student attendance
is course/period-specific. Older daily-only rows remain readable as legacy general attendance.

## Grading Plan

The complete grading policy for a course, optionally overridden for one class: weighted exam
components, an optional normalized Assignments pool, and non-overlapping grade bands.
Component weights total exactly 100 percent.
