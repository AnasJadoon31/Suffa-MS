import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PageResult } from "../../lib/api";

export const DEFAULT_PAGE_SIZE = 25;

export interface PageState {
  page: number;
  pageSize: number;
}

export function pageParams(state: PageState) {
  return { limit: state.pageSize, offset: state.page * state.pageSize };
}

export function recoverEmptyPage<T>(
  result: PageResult<T>,
  state: PageState,
  onChange: (next: PageState) => void,
): boolean {
  if (result.items.length > 0 || result.total === 0 || state.page === 0) return false;
  onChange({ ...state, page: state.page - 1 });
  return true;
}

export function PaginationControls({
  state,
  total,
  onChange,
}: Readonly<{
  state: PageState;
  total: number;
  onChange: (next: PageState) => void;
}>) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(state.page, pages - 1);
  if (total <= state.pageSize && page === 0) return null;

  return (
    <nav className="pagination" aria-label={t("paginationLabel")}>
      <button
        className="secondaryAction"
        type="button"
        disabled={page === 0}
        onClick={() => onChange({ ...state, page: page - 1 })}
      >
        <ChevronLeft size={15} /> {t("previousPageBtn")}
      </button>
      <span>{t("pageOfLabel", { page: page + 1, pages, total })}</span>
      <button
        className="secondaryAction"
        type="button"
        disabled={page + 1 >= pages}
        onClick={() => onChange({ ...state, page: page + 1 })}
      >
        {t("nextPageBtn")} <ChevronRight size={15} />
      </button>
    </nav>
  );
}
