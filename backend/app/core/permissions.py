from dataclasses import dataclass


@dataclass(frozen=True)
class Permission:
    code: str
    label: str
    module: str
    scoped: bool = True


class PermissionRegistry:
    def __init__(self) -> None:
        self._items: dict[str, Permission] = {}

    def register(self, *permissions: Permission) -> None:
        for permission in permissions:
            self._items[permission.code] = permission

    def all(self) -> list[Permission]:
        return sorted(self._items.values(), key=lambda item: item.code)

    def require_known(self, code: str) -> Permission:
        if code not in self._items:
            raise KeyError(f"Unknown permission: {code}")
        return self._items[code]


registry = PermissionRegistry()

# Mirrors Appendix A of the SRS (permission catalogue) so that grants issued
# today already match the codes future modules will require.
registry.register(
    Permission("teachers.add", "Add teacher records", "people", scoped=False),
    Permission("teachers.edit", "Edit teacher records", "people", scoped=False),
    Permission("teachers.view", "View teacher records", "people", scoped=False),
    Permission("teachers.attendance.manage", "Mark/correct teacher attendance", "attendance", scoped=False),
    Permission("teachers.salary.manage", "Maintain salary & payments", "finance", scoped=False),
    Permission("students.add", "Add student records", "people", scoped=False),
    Permission("students.edit", "Edit student records", "people", scoped=False),
    Permission("students.view", "View student records", "people", scoped=False),
    Permission("students.provision", "Create logins", "auth", scoped=False),
    Permission("students.send_credentials", "Send credentials", "auth", scoped=False),
    Permission("students.attendance.manage", "Mark/correct student attendance", "attendance", scoped=True),
    Permission("academics.manage", "Manage programs, classes, sections, courses, sessions", "academics", scoped=False),
    Permission("assignments.assign_teacher", "Assign teachers to class+course", "academics", scoped=False),
    Permission("attendance.take", "Take attendance", "attendance", scoped=True),
    Permission("attendance.edit_locked", "Override a locked attendance day", "attendance", scoped=False),
    Permission("assignments.create", "Create/grade assignments", "assignments", scoped=True),
    Permission("assignments.view_all", "Supervise assignments across classes", "assignments", scoped=False),
    Permission("assignments.manage_all", "Manage assignments across classes", "assignments", scoped=False),
    Permission("assignments.create_any", "Create assignments for any class", "assignments", scoped=False),
    Permission("assessments.exam_types.manage", "Create exam types & weightage", "assessments", scoped=True),
    Permission("assessments.marks.enter", "Enter marks", "assessments", scoped=True),
    Permission("assessments.results.publish", "Publish results", "assessments", scoped=False),
    Permission("grading.schemes.manage", "Define grading schemes", "assessments", scoped=False),
    Permission("timetable.manage", "Build timetables; holidays & leave", "timetable", scoped=False),
    Permission("resources.manage", "Manage the resource library", "resources", scoped=False),
    Permission("forms.create", "Build forms", "forms", scoped=True),
    Permission("forms.responses.view", "View form responses", "forms", scoped=False),
    Permission("announcements.post", "Post announcements", "announcements", scoped=False),
    Permission("finance.manage", "Record income/donations", "finance", scoped=False),
    Permission("finance.reports.view", "View finance reports", "finance", scoped=False),
    Permission("messaging.send", "Send WhatsApp reports/credentials", "messaging", scoped=True),
    Permission("messaging.templates.manage", "Manage bilingual message templates", "messaging", scoped=False),
    Permission("blog.manage", "Author/manage blog posts", "web", scoped=False),
    Permission("contact.enquiries.view", "View public contact enquiries", "web", scoped=False),
)
