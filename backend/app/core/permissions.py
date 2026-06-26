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
registry.register(
    Permission("teachers.add", "Add and edit teachers", "people", scoped=False),
    Permission("students.add", "Add and edit students", "people", scoped=False),
    Permission("attendance.mark", "Mark assigned attendance", "attendance"),
    Permission("attendance.manage_all", "Manage all attendance", "attendance", scoped=False),
    Permission("assignments.manage", "Manage assigned assignments", "assignments"),
    Permission("assignments.manage_all", "Manage all assignments", "assignments", scoped=False),
    Permission("results.publish", "Publish results", "assessments", scoped=False),
    Permission("finance.manage", "Manage voluntary finance ledger", "finance", scoped=False),
    Permission("blog.manage", "Manage public blog", "web", scoped=False),
)
