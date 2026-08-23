import re

with open("backend/app/modules/assessments/schemas.py", "r") as f:
    content = f.read()

content = content.replace("overall_score: float | None = None", "overall_score: float | None = None\n    published: bool = False")

with open("backend/app/modules/assessments/schemas.py", "w") as f:
    f.write(content)

print("Patched schemas.py")
