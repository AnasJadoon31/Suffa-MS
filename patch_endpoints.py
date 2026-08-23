import re

with open("app/src/lib/mms/endpoints.ts", "r") as f:
    content = f.read()

content = content.replace("  overall_score: number | null;\n}", "  overall_score: number | null;\n  published: boolean;\n}")

with open("app/src/lib/mms/endpoints.ts", "w") as f:
    f.write(content)

print("Patched endpoints.ts")
