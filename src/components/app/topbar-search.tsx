"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Link, useRouter } from "@/i18n/navigation";
import {
  SEARCH_QUERY_MAX_LENGTH,
  type SearchGroup,
  type SearchResults,
  type SearchStudent,
} from "@/modules/search/schemas";

type SearchStatus = "idle" | "loading" | "ready" | "error";

type FlatResult =
  | { kind: "student"; student: SearchStudent; href: string }
  | { kind: "group"; group: SearchGroup; href: string };

const EMPTY_RESULTS: SearchResults = { students: [], groups: [] };

export function TopbarSearch() {
  const t = useTranslations("Search");
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId().replace(/:/g, "");
  const panelId = `${baseId}-search-panel`;
  const studentsHeadingId = `${baseId}-search-students`;
  const groupsHeadingId = `${baseId}-search-groups`;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = query.trim();
  const showPanel = open && trimmedQuery.length > 0;

  const flat: FlatResult[] = [
    ...results.students.map((student): FlatResult => ({
      kind: "student",
      student,
      href: `/app/students/${student.id}`,
    })),
    ...results.groups.map((group): FlatResult => ({
      kind: "group",
      group,
      href: `/app/groups/${group.id}`,
    })),
  ];

  const optionId = (item: FlatResult) =>
    `${baseId}-search-option-${item.kind}-${item.kind === "student" ? item.student.id : item.group.id}`;
  const activeItem = activeIndex >= 0 ? flat[activeIndex] : undefined;
  const activeOptionId = activeItem ? optionId(activeItem) : undefined;

  useEffect(() => {
    if (!trimmedQuery) return;

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("search failed");

        const data = (await response.json()) as Partial<SearchResults>;
        if (!Array.isArray(data.students) || !Array.isArray(data.groups)) {
          throw new Error("invalid search response");
        }

        setResults({ students: data.students, groups: data.groups });
        setStatus("ready");
        setOpen(true);
      } catch {
        if (controller.signal.aborted) return;
        setResults(EMPTY_RESULTS);
        setStatus("error");
        setOpen(true);
      }
    }, 160);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  useEffect(() => {
    if (!open && !expanded) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, expanded]);

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  function resetSearch() {
    setResults(EMPTY_RESULTS);
    setStatus("idle");
    setOpen(false);
    setActiveIndex(-1);
  }

  function close() {
    setOpen(false);
    setExpanded(false);
    setActiveIndex(-1);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (flat.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) return direction === 1 ? 0 : flat.length - 1;
        return (current + direction + flat.length) % flat.length;
      });
      return;
    }

    if (event.key === "Enter" && activeItem) {
      event.preventDefault();
      const href = activeItem.href;
      setQuery("");
      resetSearch();
      close();
      router.push(href);
    }
  }

  function finishNavigation() {
    setQuery("");
    resetSearch();
    close();
  }

  const liveMessage =
    status === "loading"
      ? t("loading")
      : status === "error"
        ? t("error")
        : status === "ready"
          ? flat.length > 0
            ? t("resultsCount", { count: flat.length })
            : t("noResults", { query: trimmedQuery })
          : "";

  return (
    <div className="app-topbar-search" ref={rootRef}>
      <div className="app-search" data-expanded={expanded}>
        <button
          type="button"
          className="ui-button app-search-trigger"
          data-variant="ghost"
          data-size="icon"
          aria-label={t("open")}
          onClick={() => {
            setExpanded(true);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Icon name="search" size={19} />
        </button>

        <div className="app-search-field">
          <Icon name="search" size={16} className="app-search-icon" />
          <input
            ref={inputRef}
            type="search"
            className="app-search-input"
            value={query}
            placeholder={t("placeholder")}
            aria-label={t("label")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showPanel}
            aria-controls={showPanel ? panelId : undefined}
            aria-activedescendant={activeOptionId}
            aria-busy={status === "loading"}
            autoComplete="off"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (value.trim()) {
                setStatus("loading");
                setActiveIndex(-1);
                setOpen(true);
              } else {
                resetSearch();
              }
            }}
            onFocus={() => {
              if (trimmedQuery) setOpen(true);
            }}
            onKeyDown={onInputKeyDown}
          />
          {query ? (
            <button
              type="button"
              className="app-search-clear"
              aria-label={t("clear")}
              onClick={() => {
                setQuery("");
                resetSearch();
                inputRef.current?.focus();
              }}
            >
              <Icon name="x" size={13} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="ui-button app-search-close"
          data-variant="ghost"
          data-size="icon"
          aria-label={t("close")}
          onClick={() => {
            setQuery("");
            resetSearch();
            close();
          }}
        >
          <Icon name="x" size={18} />
        </button>

        {showPanel ? (
          <div
            className="app-search-panel"
            id={panelId}
            role="listbox"
            aria-label={t("resultsLabel")}
          >
            {status === "loading" ? (
              <p className="app-search-message">{t("loading")}</p>
            ) : status === "error" ? (
              <p className="app-search-message" data-tone="error">
                {t("error")}
              </p>
            ) : flat.length === 0 ? (
              <p className="app-search-message">{t("noResults", { query: trimmedQuery })}</p>
            ) : (
              <>
                {results.students.length > 0 ? (
                  <div
                    className="app-search-section"
                    role="group"
                    aria-labelledby={studentsHeadingId}
                  >
                    <p className="app-search-heading" id={studentsHeadingId}>
                      {t("students")}
                    </p>
                    {results.students.map((student, index) => {
                      const item: FlatResult = {
                        kind: "student",
                        student,
                        href: `/app/students/${student.id}`,
                      };
                      return (
                        <Link
                          key={student.id}
                          id={optionId(item)}
                          href={item.href}
                          role="option"
                          aria-selected={index === activeIndex}
                          tabIndex={-1}
                          data-active={index === activeIndex}
                          className="app-search-option"
                          onClick={finishNavigation}
                          onMouseEnter={() => setActiveIndex(index)}
                        >
                          <Icon name="student" size={17} className="app-search-option-icon" />
                          <span className="app-search-option-text">
                            <span className="app-search-option-title">
                              {student.firstName} {student.lastName}
                            </span>
                            <span className="app-search-option-meta">
                              {student.grade ?? t("student")}
                            </span>
                          </span>
                          <Icon
                            name="chevronLeft"
                            size={14}
                            className="app-search-option-chevron"
                            directional
                          />
                        </Link>
                      );
                    })}
                  </div>
                ) : null}

                {results.groups.length > 0 ? (
                  <div
                    className="app-search-section"
                    role="group"
                    aria-labelledby={groupsHeadingId}
                  >
                    <p className="app-search-heading" id={groupsHeadingId}>
                      {t("groups")}
                    </p>
                    {results.groups.map((group, groupIndex) => {
                      const item: FlatResult = {
                        kind: "group",
                        group,
                        href: `/app/groups/${group.id}`,
                      };
                      const index = results.students.length + groupIndex;
                      return (
                        <Link
                          key={group.id}
                          id={optionId(item)}
                          href={item.href}
                          role="option"
                          aria-selected={index === activeIndex}
                          tabIndex={-1}
                          data-active={index === activeIndex}
                          className="app-search-option"
                          onClick={finishNavigation}
                          onMouseEnter={() => setActiveIndex(index)}
                        >
                          <Icon name="layers" size={17} className="app-search-option-icon" />
                          <span className="app-search-option-text">
                            <span className="app-search-option-title">{group.name}</span>
                            <span className="app-search-option-meta">
                              {group.subjectName ?? group.grade ?? t("group")}
                            </span>
                          </span>
                          <Icon
                            name="chevronLeft"
                            size={14}
                            className="app-search-option-chevron"
                            directional
                          />
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <p className="ui-visually-hidden" aria-live="polite">
          {liveMessage}
        </p>
      </div>
    </div>
  );
}
