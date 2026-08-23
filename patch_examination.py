import re

with open("app/src/routes/examination.tsx", "r") as f:
    content = f.read()

count_memo = """  const classMissingMarkCount = useMemo(() => {
    if (!classMatrix.data) return 0;
    let count = 0;
    for (const sec of classMatrix.data.sections) {
      for (const student of sec.students) {
        for (const c of student.courses) {
          if (c.marks.some((m) => m.score === null)) count++;
        }
      }
    }
    return count;
  }, [classMatrix.data]);"""

new_count_memo = """  const classMissingMarkCount = useMemo(() => {
    if (!classMatrix.data) return 0;
    let count = 0;
    for (const sec of classMatrix.data.sections) {
      for (const student of sec.students) {
        for (const c of student.courses) {
          if (c.marks.some((m) => m.score === null)) count++;
        }
      }
    }
    return count;
  }, [classMatrix.data]);

  const { totalStudentCount, publishedCount } = useMemo(() => {
    let total = 0;
    let published = 0;
    if (classMatrix.data) {
      for (const sec of classMatrix.data.sections) {
        for (const student of sec.students) {
          total++;
          if (student.published) published++;
        }
      }
    }
    return { totalStudentCount: total, publishedCount: published };
  }, [classMatrix.data]);"""

content = content.replace(count_memo, new_count_memo)

ui_code = """                    {!teacherScoped && canManage ? (
                      <div className="space-y-1">
                        <button disabled={publish.isPending || classMatrix.isLoading || !canPublishClassResults} onClick={() => publish.mutate()} className="gradient-emerald w-full rounded-xl py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
                          {t("Publish class results")}
                        </button>
                        {!classMatrix.isLoading && classMissingMarkCount > 0 ? (
                          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                            {t("Complete all course marks before publishing")} ({classMissingMarkCount})
                          </p>
                        ) : null}
                      </div>
                    ) : null}"""

new_ui_code = """                    {!teacherScoped && canManage ? (
                      <div className="space-y-1">
                        {publishedCount === totalStudentCount && totalStudentCount > 0 ? (
                          <p className="rounded-xl bg-success-soft px-3 py-2 text-xs font-semibold text-success text-center">
                            {t("Results published")}
                          </p>
                        ) : (
                          <>
                            <button disabled={publish.isPending || classMatrix.isLoading || !canPublishClassResults} onClick={() => publish.mutate()} className="gradient-emerald w-full rounded-xl py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
                              {publishedCount > 0 ? t("Publish remaining results") : t("Publish class results")}
                            </button>
                            {!classMatrix.isLoading && classMissingMarkCount > 0 ? (
                              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                                {t("Complete all course marks before publishing")} ({classMissingMarkCount})
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}"""

content = content.replace(ui_code, new_ui_code)

with open("app/src/routes/examination.tsx", "w") as f:
    f.write(content)

print("Patched examination.tsx")
