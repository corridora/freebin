"use client";
import { Fragment, useState, useEffect, useRef, useEffectEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Inspector.css";
import RequestBody from "@/components/RequestBody";
import RequestHistogram from "@/components/RequestHistogram";
type BinView =
  "requests" | "config" | "rules" | "histogram" | "audit" | "delete";
export default function Inspector({ data = {}, form, readOnly = false }: any) {
  const router = useRouter();
  const [interactions, setInteractions] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [locationReady, setLocationReady] = useState(false);
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState("");
  const [headerFilter, setHeaderFilter] = useState("");
  const [headerValueFilter, setHeaderValueFilter] = useState("");
  const [bodyFieldFilter, setBodyFieldFilter] = useState("");
  const [bodyValueFilter, setBodyValueFilter] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const requestListElement = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReplayUrl, setBulkReplayUrl] = useState("");
  const [bulkProgress, setBulkProgress] = useState<
    Array<{
      id: string;
      method: string;
      path: string;
      operation: string;
      status: string;
      detail: string;
    }>
  >([]);
  const [binView, setBinView] = useState<BinView>("requests");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenu = useRef<HTMLDivElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement | null>(null);
  const viewHeading = useRef<HTMLHeadingElement | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingBin, setDeletingBin] = useState(false);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [responseStatus, setResponseStatus] = useState(200);
  const [responseBody, setResponseBody] = useState(
    '{"ok":true,"captured":true}',
  );
  const [responseContentType, setResponseContentType] = useState(
    "application/json; charset=utf-8",
  );
  const [responseHeaders, setResponseHeaders] = useState("{}");
  const [forwardingEnabled, setForwardingEnabled] = useState(false);
  const [forwardingUrl, setForwardingUrl] = useState("");
  const [forwardingAuthHeaders, setForwardingAuthHeaders] = useState("");
  const [forwardingConditions, setForwardingConditions] = useState<
    Array<{ source: string; key: string; operator: string; value: string }>
  >([]);
  const [replayUrl, setReplayUrl] = useState("");
  const [replayMethod, setReplayMethod] = useState("POST");
  const [replayPath, setReplayPath] = useState("/");
  const [replayQuery, setReplayQuery] = useState("{}");
  const [replayHeaders, setReplayHeaders] = useState("{}");
  const [replayBody, setReplayBody] = useState("");
  const [replayAttempts, setReplayAttempts] = useState<any[]>([]);
  const [forwardAttempts, setForwardAttempts] = useState<any[]>([]);
  const [replayBusy, setReplayBusy] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [binPublicShareToken, setBinPublicShareToken] = useState<string | null>(
    null,
  );
  const [binName, setBinName] = useState("");
  const [rules, setRules] = useState<any[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleConditions, setRuleConditions] = useState(
    '[\n  { "source": "method", "operator": "equals", "value": "POST" }\n]',
  );
  const [ruleStatus, setRuleStatus] = useState(200);
  const [ruleBody, setRuleBody] = useState('{"matched":true}');
  const [ruleContentType, setRuleContentType] = useState(
    "application/json; charset=utf-8",
  );
  const [ruleHeaders, setRuleHeaders] = useState("{}");
  const [ruleDelayMs, setRuleDelayMs] = useState(0);
  const [ruleTestInput, setRuleTestInput] = useState(
    '{\n  "method": "POST",\n  "path": "/",\n  "query": {},\n  "headers": {},\n  "body": "{}",\n  "contentType": "application/json"\n}',
  );
  const endpoint =
    typeof window === "undefined"
      ? `/b/${data.id}`
      : `${location.origin}/b/${data.id}`;
  const methods = [
    ...new Set(interactions.map((item) => String(item.method))),
  ].sort();
  function bodyField(body: unknown, path: string) {
    if (!path) return undefined;
    let parsed: unknown;
    try {
      parsed = typeof body === "string" ? JSON.parse(body) : body;
    } catch {
      return undefined;
    }
    return path
      .split(".")
      .reduce<unknown>(
        (value, part) =>
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[part]
            : undefined,
        parsed,
      );
  }
  const filteredInteractions = interactions.filter((item) => {
    const matchesMethod =
      methodFilter === "ALL" || item.method === methodFilter;
    const needle = query.trim().toLowerCase();
    const matchesQuery =
      !needle || JSON.stringify(item).toLowerCase().includes(needle);
    const timestamp = Date.parse(item.timestamp);
    const matchesFrom = !timeFrom || timestamp >= new Date(timeFrom).getTime();
    const matchesTo = !timeTo || timestamp <= new Date(timeTo).getTime();
    const matchesPath =
      !pathFilter.trim() ||
      String(item.path || "")
        .toLowerCase()
        .includes(pathFilter.trim().toLowerCase());
    const contentType = String(
      item.contentType || item.headers?.["content-type"] || "",
    );
    const matchesContentType =
      !contentTypeFilter.trim() ||
      contentType
        .toLowerCase()
        .includes(contentTypeFilter.trim().toLowerCase());
    const normalizedHeaders = Object.fromEntries(
      Object.entries(item.headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        String(value),
      ]),
    );
    const requestedHeader = headerFilter.trim().toLowerCase();
    const headerValue = requestedHeader
      ? normalizedHeaders[requestedHeader]
      : undefined;
    const matchesHeader =
      !requestedHeader ||
      (headerValue !== undefined &&
        (!headerValueFilter.trim() ||
          headerValue
            .toLowerCase()
            .includes(headerValueFilter.trim().toLowerCase())));
    const requestedBodyField = bodyFieldFilter.trim();
    const fieldValue = requestedBodyField
      ? bodyField(item.body, requestedBodyField)
      : undefined;
    const matchesBodyField =
      !requestedBodyField ||
      (fieldValue !== undefined &&
        (!bodyValueFilter.trim() ||
          JSON.stringify(fieldValue)
            .toLowerCase()
            .includes(bodyValueFilter.trim().toLowerCase())));
    return (
      matchesMethod &&
      matchesQuery &&
      matchesFrom &&
      matchesTo &&
      matchesPath &&
      matchesContentType &&
      matchesHeader &&
      matchesBodyField
    );
  });
  const totalPages =
    pageSize === "all"
      ? 1
      : Math.max(1, Math.ceil(filteredInteractions.length / Number(pageSize)));
  const pagedInteractions =
    pageSize === "all"
      ? filteredInteractions
      : filteredInteractions.slice(
          (currentPage - 1) * Number(pageSize),
          currentPage * Number(pageSize),
        );
  const firstResult = filteredInteractions.length
    ? pageSize === "all"
      ? 1
      : (currentPage - 1) * Number(pageSize) + 1
    : 0;
  const lastResult =
    pageSize === "all"
      ? filteredInteractions.length
      : Math.min(currentPage * Number(pageSize), filteredInteractions.length);
  const pageNumbers = (() => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    const nearby = new Set([
      1,
      totalPages,
      currentPage - 1,
      currentPage,
      currentPage + 1,
    ]);
    const pages = [...nearby]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);
    const compact: Array<number | "ellipsis"> = [];
    for (const page of pages) {
      const previous = compact.at(-1);
      if (typeof previous === "number" && page - previous > 1)
        compact.push("ellipsis");
      compact.push(page);
    }
    return compact;
  })();
  const pageIsSelected =
    pagedInteractions.length > 0 &&
    pagedInteractions.every((item) => selectedIds.includes(item.id));
  const advancedFilterCount = [
    timeFrom,
    timeTo,
    pathFilter,
    contentTypeFilter,
    headerFilter,
    headerValueFilter,
    bodyFieldFilter,
    bodyValueFilter,
  ].filter((value) => value.trim()).length;
  const responseBytes = (value: string) =>
    new TextEncoder().encode(value).byteLength;
  function stateUrl(page = currentPage) {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== "10") params.set("pageSize", pageSize);
    if (query.trim()) params.set("q", query.trim());
    if (methodFilter !== "ALL") params.set("method", methodFilter);
    if (timeFrom) params.set("from", timeFrom);
    if (timeTo) params.set("to", timeTo);
    if (pathFilter.trim()) params.set("path", pathFilter.trim());
    if (contentTypeFilter.trim())
      params.set("contentType", contentTypeFilter.trim());
    if (headerFilter.trim()) params.set("header", headerFilter.trim());
    if (headerValueFilter.trim())
      params.set("headerValue", headerValueFilter.trim());
    if (bodyFieldFilter.trim()) params.set("bodyField", bodyFieldFilter.trim());
    if (bodyValueFilter.trim()) params.set("bodyValue", bodyValueFilter.trim());
    const path =
      typeof location === "undefined" ? `/bin/${data.id}` : location.pathname;
    return `${path}${params.size ? `?${params}` : ""}`;
  }
  function applyLocationState() {
    const params = new URLSearchParams(location.search);
    const restoredPageSize = params.get("pageSize") || "10";
    setPageSize(
      ["10", "25", "50", "all"].includes(restoredPageSize)
        ? restoredPageSize
        : "10",
    );
    setQuery(params.get("q") || "");
    setMethodFilter(params.get("method") || "ALL");
    setTimeFrom(params.get("from") || "");
    setTimeTo(params.get("to") || "");
    setPathFilter(params.get("path") || "");
    setContentTypeFilter(params.get("contentType") || "");
    setHeaderFilter(params.get("header") || "");
    setHeaderValueFilter(params.get("headerValue") || "");
    setBodyFieldFilter(params.get("bodyField") || "");
    setBodyValueFilter(params.get("bodyValue") || "");
    setShowAdvancedFilters(
      [
        "from",
        "to",
        "path",
        "contentType",
        "header",
        "headerValue",
        "bodyField",
        "bodyValue",
      ].some((key) => Boolean(params.get(key))),
    );
    setLocationReady(true);
    setCurrentPage(
      Math.max(Number.parseInt(params.get("page") || "1", 10) || 1, 1),
    );
    setExpandedId(null);
  }
  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    setExpandedId(null);
    history.pushState(
      {},
      "",
      stateUrl(Math.min(Math.max(page, 1), totalPages)),
    );
    requestAnimationFrame(() =>
      requestListElement.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  function filtersChanged() {
    setCurrentPage(1);
    setExpandedId(null);
    history.replaceState({}, "", stateUrl(1));
  }
  function searchChanged(event: any) {
    setQuery((event.currentTarget as HTMLInputElement).value);
    filtersChanged();
  }
  function methodChanged(event: any) {
    setMethodFilter((event.currentTarget as HTMLSelectElement).value);
    filtersChanged();
  }
  function pageSizeChanged() {
    setCurrentPage(1);
    setExpandedId(null);
    history.pushState({}, "", stateUrl(1));
  }
  function pageSizeSelected(event: any) {
    setPageSize((event.currentTarget as HTMLSelectElement).value);
    pageSizeChanged();
  }
  function clearAdvancedFilters() {
    setTimeFrom("");
    setTimeTo("");
    setPathFilter("");
    setContentTypeFilter("");
    setHeaderFilter("");
    setHeaderValueFilter("");
    setBodyFieldFilter("");
    setBodyValueFilter("");
    filtersChanged();
  }
  async function refresh() {
    if (readOnly) return data.interactions || [];
    try {
      const response = await fetch(
        `/api/v1/bins/${data.id}/interactions?limit=all`,
      );
      const result = (await response.json()) as {
        error?: string;
        interactions: any[];
      };
      if (!response.ok) throw new Error(result.error);
      setInteractions(result.interactions);
      setSelectedIds((previous) =>
        previous.filter((id) =>
          result.interactions.some((item) => item.id === id),
        ),
      );
      if (expandedId) void loadForwardAttempts(expandedId);
      setError("");
      return result.interactions;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load requests",
      );
    } finally {
      setLoading(false);
    }
  }
  async function loadSettings() {
    const response = readOnly ? null : await fetch(`/api/v1/bins/${data.id}`);
    const result = (readOnly ? { bin: data.bin } : await response!.json()) as {
      bin?: any;
    };
    if ((!readOnly && !response!.ok) || !result.bin) return;
    setResponseStatus(result.bin.responseStatus);
    setResponseBody(result.bin.responseBody);
    setResponseContentType(result.bin.responseContentType);
    setResponseHeaders(JSON.stringify(result.bin.responseHeaders, null, 2));
    setForwardingEnabled(Boolean(Number(result.bin.forwardingEnabled)));
    setForwardingUrl(result.bin.forwardingUrl || "");
    setForwardingAuthHeaders(
      (result.bin.forwardingAuthHeaders || []).join(", "),
    );
    setForwardingConditions(
      (result.bin.forwardingConditions || []).map(
        (condition: {
          source: string;
          key?: string;
          operator: string;
          value?: string;
        }) => ({
          source: condition.source,
          key: condition.key || "",
          operator: condition.operator,
          value: condition.value || "",
        }),
      ),
    );
    setBinPublicShareToken(result.bin.publicShareToken);
    setBinName(result.bin.name || data.id);
  }
  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleName("");
    setRuleEnabled(true);
    setRuleConditions(
      '[\n  { "source": "method", "operator": "equals", "value": "POST" }\n]',
    );
    setRuleStatus(200);
    setRuleBody('{"matched":true}');
    setRuleContentType("application/json; charset=utf-8");
    setRuleHeaders("{}");
    setRuleDelayMs(0);
  }
  async function loadRules() {
    if (readOnly) {
      setRules(data.rules || []);
      return;
    }
    const response = await fetch(`/api/v1/bins/${data.id}/rules`);
    const result = (await response.json()) as {
      rules?: any[];
    };
    if (response.ok) setRules(result.rules || []);
  }
  function editRule(rule: any) {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleEnabled(rule.enabled);
    setRuleConditions(JSON.stringify(rule.conditions, null, 2));
    setRuleStatus(rule.responseStatus);
    setRuleBody(rule.responseBody);
    setRuleContentType(rule.responseContentType);
    setRuleHeaders(JSON.stringify(rule.responseHeaders, null, 2));
    setRuleDelayMs(rule.responseDelayMs);
  }
  async function saveRule() {
    if (readOnly) return;
    setActionMessage("");
    try {
      const payload = {
        name: ruleName,
        enabled: ruleEnabled,
        conditions: JSON.parse(ruleConditions),
        responseStatus: ruleStatus,
        responseBody: ruleBody,
        responseContentType: ruleContentType,
        responseHeaders: JSON.parse(ruleHeaders),
        responseDelayMs: ruleDelayMs,
      };
      const response = await fetch(
        `/api/v1/bins/${data.id}/rules${editingRuleId ? `/${editingRuleId}` : ""}`,
        {
          method: editingRuleId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Could not save rule");
      await loadRules();
      resetRuleForm();
      setActionMessage("Response rule saved");
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not save rule",
      );
    }
  }
  async function deleteRule(rule: any) {
    if (readOnly) return;
    if (!confirm(`Delete response rule “${rule.name}”?`)) return;
    const response = await fetch(`/api/v1/bins/${data.id}/rules/${rule.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setActionMessage("Could not delete rule");
      return;
    }
    await loadRules();
    if (editingRuleId === rule.id) resetRuleForm();
    setActionMessage("Response rule deleted");
  }
  async function moveRule(index: number, direction: number) {
    if (readOnly) return;
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const ordered = [...rules];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const response = await fetch(`/api/v1/bins/${data.id}/rules`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleIds: ordered.map((rule) => rule.id) }),
    });
    if (response.ok) setRules(ordered);
    else setActionMessage("Could not reorder rules");
  }
  async function testRules() {
    if (readOnly) return;
    try {
      const response = await fetch(`/api/v1/bins/${data.id}/rules/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(JSON.parse(ruleTestInput)),
      });
      const result = (await response.json()) as {
        error?: string;
        matched?: {
          name: string;
          responseStatus: number;
        } | null;
      };
      if (!response.ok) throw new Error(result.error || "Could not test rules");
      setActionMessage(
        result.matched
          ? `Matched “${result.matched.name}” → ${result.matched.responseStatus}`
          : "No enabled rule matched; the bin fallback response will be used",
      );
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not test rules",
      );
    }
  }
  async function saveSettings() {
    if (readOnly) return;
    setSavingSettings(true);
    setActionMessage("");
    try {
      const headers = JSON.parse(responseHeaders || "{}");
      const response = await fetch(`/api/v1/bins/${data.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          responseStatus,
          responseBody,
          responseContentType,
          responseHeaders: headers,
          forwardingEnabled,
          forwardingUrl,
          forwardingAuthHeaders: forwardingAuthHeaders
            .split(/[\n,]/)
            .map((name) => name.trim())
            .filter(Boolean),
          forwardingConditions: forwardingConditions.map((condition) => ({
            source: condition.source,
            operator: condition.operator,
            ...(["query", "header", "body"].includes(condition.source)
              ? { key: condition.key }
              : {}),
            ...(condition.operator === "exists"
              ? {}
              : { value: condition.value }),
          })),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Could not save response");
      setActionMessage("Bin settings saved");
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not save response",
      );
    } finally {
      setSavingSettings(false);
    }
  }
  async function exportJson() {
    if (readOnly) return;
    setActionMessage("");
    const response = await fetch(`/api/v1/bins/${data.id}/export`);
    if (!response.ok) {
      setActionMessage("Could not export this bin");
      return;
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `freebin-${data.id}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function exportConfig() {
    if (readOnly) return;
    setActionMessage("");
    const response = await fetch(`/api/v1/bins/${data.id}/config`);
    if (!response.ok) {
      setActionMessage("Could not export bin configuration");
      return;
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `freebin-${data.id}-config.v1.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function importConfig(event: any) {
    if (readOnly) return;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setActionMessage("");
    try {
      if (file.size > 320 * 1024)
        throw new Error("Configuration file exceeds 320 KB");
      const document = JSON.parse(await file.text());
      if (
        !confirm(
          "Import this configuration? The bin name, fallback response, forwarding settings, and all response rules will be replaced. Captured requests are not affected.",
        )
      )
        return;
      const response = await fetch(`/api/v1/bins/${data.id}/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(document),
      });
      const result = (await response.json()) as {
        error?: string;
        importedRules?: number;
      };
      if (!response.ok)
        throw new Error(result.error || "Could not import configuration");
      await Promise.all([loadSettings(), loadRules()]);
      setActionMessage(
        `Configuration imported with ${result.importedRules || 0} response rules`,
      );
    } catch (cause) {
      setActionMessage(
        cause instanceof Error
          ? cause.message
          : "Could not import configuration",
      );
    } finally {
      input.value = "";
    }
  }
  const replayBlockedHeaders = new Set([
    "host",
    "authorization",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
    "cf-ray",
    "cf-connecting-ip",
    "x-forwarded-for",
  ]);
  const replaySensitiveHeader =
    /authorization|(^|[-_])(auth|cookie|credential|key|secret|signature|token)($|[-_])|api[-_]?key/i;
  function safeReplayHeaders() {
    const parsed = JSON.parse(replayHeaders || "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([key]) =>
            !replayBlockedHeaders.has(key.toLowerCase()) &&
            !replaySensitiveHeader.test(key),
        )
        .map(([key, value]) => [key, String(value)]),
    );
  }
  function initializeReplay(item: any) {
    setReplayMethod(item.method);
    setReplayPath(item.path);
    setReplayQuery(JSON.stringify(item.query || {}, null, 2));
    setReplayHeaders(JSON.stringify(item.headers || {}, null, 2));
    setReplayBody(item.body ?? "");
    setCurlCopied(false);
  }
  async function loadReplayAttempts(requestId: string) {
    if (readOnly) return;
    const response = await fetch(
      `/api/v1/bins/${data.id}/interactions/${requestId}/replay`,
    );
    const result = (await response.json()) as {
      attempts?: any[];
    };
    setReplayAttempts(response.ok ? result.attempts || [] : []);
  }
  function openBinView(view: BinView) {
    setBinView(view);
    setSettingsMenuOpen(false);
    setDeleteConfirmation("");
    setActionMessage("");
  }
  async function loadAudit() {
    if (readOnly) {
      setAuditEvents(data.auditEvents || []);
      return;
    }
    try {
      const response = await fetch(`/api/v1/bins/${data.id}/audit?limit=100`);
      const result = (await response.json()) as {
        events?: any[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Could not load audit history");
      setAuditEvents(result.events || []);
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not load audit history",
      );
    }
  }
  async function loadForwardAttempts(requestId: string) {
    if (readOnly) return;
    const response = await fetch(
      `/api/v1/bins/${data.id}/interactions/${requestId}/forwarding`,
    );
    const result = (await response.json()) as {
      attempts?: any[];
    };
    setForwardAttempts(response.ok ? result.attempts || [] : []);
  }
  async function replay(item: any) {
    if (readOnly) return;
    setActionMessage("");
    setReplayBusy(true);
    let queryInput: Record<string, string | string[]>;
    let headersInput: Record<string, string>;
    try {
      queryInput = JSON.parse(replayQuery || "{}");
      headersInput = safeReplayHeaders();
    } catch {
      setActionMessage("Replay query and headers must be valid JSON objects");
      setReplayBusy(false);
      return;
    }
    const response = await fetch(
      `/api/v1/bins/${data.id}/interactions/${item.id}/replay`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: replayUrl,
          method: replayMethod,
          path: replayPath,
          query: queryInput,
          headers: headersInput,
          body: replayBody,
        }),
      },
    );
    const result = (await response.json()) as {
      error?: string;
      status?: number | null;
      statusText?: string | null;
    };
    setActionMessage(
      response.ok
        ? `Replay returned ${result.status} ${result.statusText || ""}`.trim()
        : result.error || "Replay failed",
    );
    await loadReplayAttempts(item.id);
    setReplayBusy(false);
  }
  function shellQuote(value: string) {
    return `'${value.replaceAll("'", `'\"'\"'`)}'`;
  }
  function replayTarget() {
    try {
      const target = new URL(replayUrl);
      target.pathname = replayPath;
      target.search = "";
      const values = JSON.parse(replayQuery || "{}") as Record<
        string,
        string | string[]
      >;
      for (const [key, value] of Object.entries(values))
        for (const item of Array.isArray(value) ? value : [value])
          target.searchParams.append(key, String(item));
      return target.href;
    } catch {
      return replayUrl || "https://example.com/";
    }
  }
  function curlCommand() {
    let headers: Record<string, string> = {};
    try {
      headers = safeReplayHeaders();
    } catch {
      /* Keep the preview usable while JSON is being edited. */
    }
    const parts = [
      `curl -X ${replayMethod || "POST"} ${shellQuote(replayTarget())}`,
    ];
    for (const [key, value] of Object.entries(headers))
      parts.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
    if (
      !["GET", "HEAD"].includes((replayMethod || "").toUpperCase()) &&
      replayBody
    )
      parts.push(`  --data-raw ${shellQuote(replayBody)}`);
    return parts.join(" \\\n");
  }
  async function copyCurl() {
    if (readOnly) return;
    await navigator.clipboard.writeText(curlCommand());
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 1200);
  }
  async function exportRequest(item: any) {
    if (readOnly) return;
    setActionMessage("");
    const response = await fetch(
      `/api/v1/bins/${data.id}/interactions/${item.id}/export`,
    );
    if (!response.ok) {
      setActionMessage("Could not export this request");
      return;
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `freebin-${data.id}-${item.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function toggleSelection(id: string) {
    if (readOnly) return;
    setSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }
  function togglePageSelection() {
    if (readOnly) return;
    const pageIds = pagedInteractions.map((item) => String(item.id));
    setSelectedIds(
      pageIsSelected
        ? selectedIds.filter((id) => !pageIds.includes(id))
        : [...new Set([...selectedIds, ...pageIds])],
    );
  }
  function exportSelected() {
    if (readOnly) return;
    const requests = interactions.filter((item) =>
      selectedIds.includes(item.id),
    );
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), binId: data.id, requests },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `freebin-${data.id}-selected-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setActionMessage(
      `Exported ${requests.length} selected request${requests.length === 1 ? "" : "s"}`,
    );
  }
  async function deleteSelected() {
    if (readOnly) return;
    const ids = [...selectedIds];
    if (
      !ids.length ||
      !confirm(
        `Delete ${ids.length} selected request${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    )
      return;
    setBulkBusy(true);
    setActionMessage("");
    const deleted: string[] = [];
    for (const id of ids) {
      try {
        const response = await fetch(
          `/api/v1/bins/${data.id}/interactions/${id}`,
          { method: "DELETE" },
        );
        if (response.ok) deleted.push(id);
      } catch {
        // Continue so successful deletions are reflected and failures are reported together.
      }
    }
    setInteractions((previous) =>
      previous.filter((item) => !deleted.includes(item.id)),
    );
    setSelectedIds((previous) =>
      previous.filter((id) => !deleted.includes(id)),
    );
    if (expandedId && deleted.includes(expandedId)) setExpandedId(null);
    const failed = ids.length - deleted.length;
    setActionMessage(
      failed
        ? `Deleted ${deleted.length} requests; ${failed} could not be deleted`
        : `Deleted ${deleted.length} selected request${deleted.length === 1 ? "" : "s"}`,
    );
    setBulkBusy(false);
  }
  async function runBulkEgress(operation: "replay" | "forward") {
    if (readOnly) return;
    const selected = interactions.filter((item) =>
      selectedIds.includes(item.id),
    );
    if (!selected.length || bulkBusy) return;
    if (operation === "replay" && !bulkReplayUrl) {
      setActionMessage("Enter a bulk replay destination");
      return;
    }
    if (operation === "forward" && (!forwardingEnabled || !forwardingUrl)) {
      setActionMessage(
        "Configure and enable automatic forwarding before bulk forwarding",
      );
      return;
    }
    setBulkBusy(true);
    setActionMessage("");
    const progress = selected.map((item) => ({
      id: item.id,
      method: item.method,
      path: item.path,
      operation,
      status: "queued",
      detail: "",
    }));
    setBulkProgress([...progress]);
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < selected.length) {
        const index = nextIndex++;
        const item = selected[index];
        progress[index] = { ...progress[index], status: "running" };
        setBulkProgress([...progress]);
        try {
          const response = await fetch(
            `/api/v1/bins/${data.id}/interactions/${item.id}/replay`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(
                operation === "forward"
                  ? { operation }
                  : { operation, url: bulkReplayUrl },
              ),
            },
          );
          const result = (await response.json()) as {
            error?: string;
            status?: number | null;
            statusText?: string | null;
          };
          progress[index] = {
            ...progress[index],
            status: response.ok ? "complete" : "failed",
            detail: response.ok
              ? `HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ""}`
              : result.error || "Request failed",
          };
        } catch (cause) {
          progress[index] = {
            ...progress[index],
            status: "failed",
            detail: cause instanceof Error ? cause.message : "Request failed",
          };
        }
        setBulkProgress([...progress]);
        if (expandedId === item.id) await loadReplayAttempts(item.id);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(3, selected.length) }, () => worker()),
    );
    const failed = progress.filter((item) => item.status === "failed").length;
    setActionMessage(
      `${operation === "forward" ? "Forwarded" : "Replayed"} ${selected.length - failed} of ${selected.length} selected requests${failed ? `; ${failed} failed` : ""}`,
    );
    setBulkBusy(false);
  }
  async function toggleBinShare() {
    if (readOnly) return;
    const response = await fetch(`/api/v1/bins/${data.id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ public: !binPublicShareToken }),
    });
    const result = (await response.json()) as {
      error?: string;
      shareUrl?: string | null;
    };
    if (!response.ok) {
      setActionMessage(result.error || "Could not update sharing");
      return;
    }
    setBinPublicShareToken(
      result.shareUrl ? result.shareUrl.split("/").pop() || null : null,
    );
    if (result.shareUrl) {
      await navigator.clipboard.writeText(result.shareUrl);
      setActionMessage("Public bin link copied");
    } else setActionMessage("Public bin link revoked");
  }
  async function toggleRequestShare(item: any) {
    if (readOnly) return;
    const response = await fetch(
      `/api/v1/bins/${data.id}/interactions/${item.id}/share`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public: !item.publicShareToken }),
      },
    );
    const result = (await response.json()) as {
      error?: string;
      shareUrl?: string | null;
    };
    if (!response.ok) {
      setActionMessage(result.error || "Could not update sharing");
      return;
    }
    const token = result.shareUrl
      ? result.shareUrl.split("/").pop() || null
      : null;
    setInteractions((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, publicShareToken: token } : entry,
      ),
    );
    if (result.shareUrl) {
      await navigator.clipboard.writeText(result.shareUrl);
      setActionMessage("Public request link copied");
    } else setActionMessage("Public request link revoked");
  }
  function sharedRequestUrl(item: any) {
    return item.publicShareToken
      ? `${location.origin}/shared/request/${item.publicShareToken}`
      : "";
  }
  async function deleteRequest(item: any) {
    if (readOnly) return;
    if (!confirm("Delete this captured request? This cannot be undone."))
      return;
    const response = await fetch(
      `/api/v1/bins/${data.id}/interactions/${item.id}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      setActionMessage("Could not delete this request");
      return;
    }
    setInteractions((previous) =>
      previous.filter((request) => request.id !== item.id),
    );
    setSelectedIds((previous) => previous.filter((id) => id !== item.id));
    setExpandedId(null);
    setActionMessage("Request deleted");
  }
  async function deleteBin() {
    if (readOnly) return;
    if (!binName || deleteConfirmation !== binName || deletingBin) return;
    setDeletingBin(true);
    setActionMessage("");
    try {
      const response = await fetch(`/api/v1/bins/${data.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete this bin");
      await invalidateAll();
      router.push("/");
    } catch (cause) {
      setActionMessage(
        cause instanceof Error ? cause.message : "Could not delete this bin",
      );
    } finally {
      setDeletingBin(false);
    }
  }
  function toggleDetails(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    const item = interactions.find((request) => request.id === id);
    if (item) initializeReplay(item);
    void Promise.all([loadReplayAttempts(id), loadForwardAttempts(id)]);
  }
  async function copy() {
    if (readOnly) return;
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  const refreshLive = useEffectEvent(() => {
    void refresh();
  });
  useEffect(() => {
    setBinView("requests");
    setSettingsMenuOpen(false);
    setDeleteConfirmation("");
    setBinName("");
  }, [data.id]);
  useEffect(() => {
    if (binView !== "requests") viewHeading.current?.focus();
    if (binView === "audit") void loadAudit();
  }, [binView, data.id]);
  useEffect(() => {
    if (!settingsMenuOpen) return;
    function dismiss(event: PointerEvent) {
      if (!settingsMenu.current?.contains(event.target as Node))
        setSettingsMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsMenuOpen(false);
        settingsButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [settingsMenuOpen]);
  useEffect(() => {
    if (!readOnly) return;
    setInteractions(data.interactions || []);
    void loadSettings();
    void loadRules();
    setAuditEvents(data.auditEvents || []);
    setLoading(false);
  }, [readOnly, data]);
  useEffect(() => {
    if (readOnly) return;
    let stopped = false;
    let stream: EventSource | undefined;
    let polling: ReturnType<typeof setInterval> | undefined;
    void Promise.all([refresh(), loadSettings(), loadRules()]).then(
      ([items]) => {
        if (stopped) return;
        const latestId = items?.[0]?.id;
        stream = new EventSource(
          `/api/v1/bins/${data.id}/stream${latestId ? `?lastId=${encodeURIComponent(latestId)}` : ""}`,
        );
        stream.addEventListener("request", refreshLive);
        stream.addEventListener("open", () => {
          if (polling) clearInterval(polling);
          polling = undefined;
        });
        stream.addEventListener("error", () => {
          if (!polling && !stopped) polling = setInterval(refreshLive, 5000);
        });
      },
    );
    return () => {
      stopped = true;
      stream?.close();
      if (polling) clearInterval(polling);
    };
  }, [data.id, readOnly]);
  useEffect(() => {
    if (!loading && currentPage > totalPages) setCurrentPage(totalPages);
  }, [loading, currentPage, totalPages]);
  useEffect(() => {
    applyLocationState();
    const restore = () => applyLocationState();
    addEventListener("popstate", restore);
    return () => removeEventListener("popstate", restore);
  }, [data.id]);
  useEffect(() => {
    if (locationReady) history.replaceState({}, "", stateUrl());
  }, [
    locationReady,
    query,
    methodFilter,
    timeFrom,
    timeTo,
    pathFilter,
    contentTypeFilter,
    headerFilter,
    headerValueFilter,
    bodyFieldFilter,
    bodyValueFilter,
    pageSize,
    currentPage,
  ]);
  return (
    <div data-view="Inspector" data-read-only={readOnly || undefined}>
      <title>
        {readOnly ? "Public Demo" : binName || `Bin ${data.id}`}
        {" | freebin.org"}
      </title>
      <div className="app">
        <div className="inspector-bar">
          <div className="endpoint mono">
            <span>{endpoint}</span>
            <button disabled={readOnly} onClick={copy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <span className="live">
            <i></i>
            {" Listening"}
          </span>
        </div>
        <main>
          <aside>
            <div className="aside-title">
              <strong>
                {"Requests "}
                <span>
                  {binView === "histogram"
                    ? interactions.length
                    : filteredInteractions.length}
                </span>
              </strong>
              <div className="top-actions">
                <button disabled={readOnly} onClick={toggleBinShare}>
                  {binPublicShareToken ? "Unshare bin" : "Share bin"}
                </button>
                <div
                  ref={settingsMenu}
                  className="settings-dropdown"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setSettingsMenuOpen(false);
                  }}
                >
                  <button
                    ref={settingsButton}
                    aria-expanded={settingsMenuOpen}
                    aria-controls="bin-settings-options"
                    onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
                  >
                    {"Bin settings"}
                    <span aria-hidden="true">{" ▾"}</span>
                  </button>
                  {settingsMenuOpen ? (
                    <div id="bin-settings-options" className="settings-options">
                      <button onClick={() => openBinView("config")}>
                        {"Config"}
                      </button>
                      <button onClick={() => openBinView("rules")}>
                        {`Response rules ${rules.length}/10`}
                      </button>
                      <button onClick={() => openBinView("histogram")}>
                        {"Request histogram"}
                      </button>
                      <button onClick={() => openBinView("audit")}>
                        {"Audit history"}
                      </button>
                      <button
                        onClick={() => openBinView("delete")}
                        className="danger"
                      >
                        {"Delete"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={exportJson}
                  disabled={readOnly || !interactions.length}
                >
                  {"Export bin data"}
                </button>
                <button
                  disabled={readOnly}
                  onClick={refresh}
                  aria-label="Refresh requests"
                  className="refresh"
                >
                  {"↻"}
                </button>
              </div>
            </div>
            {binView !== "requests" ? (
              <div className="bin-view-heading">
                <button onClick={() => openBinView("requests")}>
                  {"← Requests"}
                </button>
                <h1 ref={viewHeading} tabIndex={-1}>
                  {binView === "config"
                    ? "Config"
                    : binView === "rules"
                      ? `Response rules ${rules.length}/10`
                      : binView === "histogram"
                        ? "Request histogram"
                        : binView === "audit"
                          ? "Audit history"
                          : "Delete bin"}
                </h1>
              </div>
            ) : null}
            {binView === "requests" ? (
              <>
                <div className="filters">
                  <label>
                    <span className="sr-only">{"Search requests"}</span>
                    <input
                      value={query}
                      type="search"
                      placeholder="Search path, headers, or body…"
                      onChange={searchChanged}
                    />
                  </label>
                  <label>
                    <span className="sr-only">{"Filter by method"}</span>
                    <select value={methodFilter} onChange={methodChanged}>
                      <option value="ALL">{"All methods"}</option>
                      {methods.map((method, _index0) => (
                        <Fragment key={_index0}>
                          <option value={method}>{method}</option>
                        </Fragment>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">{"Requests per page"}</span>
                    <select
                      value={pageSize}
                      aria-label="Requests per page"
                      onChange={pageSizeSelected}
                    >
                      <option value="10">{"10 per page"}</option>
                      <option value="25">{"25 per page"}</option>
                      <option value="50">{"50 per page"}</option>
                      <option value="all">{"All"}</option>
                    </select>
                  </label>
                </div>
                <div className="filter-tools">
                  <button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    aria-expanded={showAdvancedFilters}
                  >
                    {"Advanced filters"}
                    {advancedFilterCount ? ` · ${advancedFilterCount}` : ""}
                  </button>
                  {advancedFilterCount ? (
                    <>
                      <button onClick={clearAdvancedFilters}>
                        {"Clear advanced"}
                      </button>
                    </>
                  ) : null}
                </div>
                {showAdvancedFilters ? (
                  <>
                    <section
                      aria-label="Advanced request filters"
                      className="advanced-filters"
                    >
                      <label>
                        {"Captured from"}
                        <input
                          type="datetime-local"
                          value={timeFrom ?? ""}
                          onChange={(event) => {
                            setTimeFrom(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"Captured to"}
                        <input
                          type="datetime-local"
                          value={timeTo ?? ""}
                          onChange={(event) => {
                            setTimeTo(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"Path contains"}
                        <input
                          placeholder="/webhooks/stripe"
                          value={pathFilter ?? ""}
                          onChange={(event) => {
                            setPathFilter(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"Content type contains"}
                        <input
                          placeholder="application/json"
                          value={contentTypeFilter ?? ""}
                          onChange={(event) => {
                            setContentTypeFilter(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"Header name"}
                        <input
                          placeholder="x-event-type"
                          value={headerFilter ?? ""}
                          onChange={(event) => {
                            setHeaderFilter(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"Header value contains"}
                        <input
                          placeholder="checkout"
                          disabled={!headerFilter.trim()}
                          value={headerValueFilter ?? ""}
                          onChange={(event) => {
                            setHeaderValueFilter(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"JSON body field"}
                        <input
                          placeholder="data.object.status"
                          value={bodyFieldFilter ?? ""}
                          onChange={(event) => {
                            setBodyFieldFilter(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                      <label>
                        {"Body-field value contains"}
                        <input
                          placeholder="succeeded"
                          disabled={!bodyFieldFilter.trim()}
                          value={bodyValueFilter ?? ""}
                          onChange={(event) => {
                            setBodyValueFilter(event.currentTarget.value);
                            filtersChanged();
                          }}
                        />
                      </label>
                    </section>
                  </>
                ) : null}
                {filteredInteractions.length ? (
                  <>
                    <div className="bulk-actions">
                      <label>
                        <input
                          disabled={readOnly}
                          type="checkbox"
                          checked={pageIsSelected}
                          onChange={togglePageSelection}
                        />
                        {" Select this page"}
                      </label>
                      <span>
                        {selectedIds.length}
                        {" selected"}
                      </span>
                      <input
                        type="url"
                        placeholder="Bulk replay HTTPS origin"
                        aria-label="Bulk replay destination"
                        disabled={readOnly || bulkBusy}
                        value={bulkReplayUrl ?? ""}
                        onChange={(event) => {
                          setBulkReplayUrl(event.currentTarget.value);
                        }}
                      />
                      <button
                        onClick={() => runBulkEgress("replay")}
                        disabled={
                          readOnly ||
                          !selectedIds.length ||
                          !bulkReplayUrl ||
                          bulkBusy
                        }
                      >
                        {"Replay selected"}
                      </button>
                      <button
                        onClick={() => runBulkEgress("forward")}
                        disabled={
                          readOnly ||
                          !selectedIds.length ||
                          !forwardingEnabled ||
                          bulkBusy
                        }
                      >
                        {"Forward selected"}
                      </button>
                      <button
                        onClick={exportSelected}
                        disabled={readOnly || !selectedIds.length || bulkBusy}
                      >
                        {"Export selected"}
                      </button>
                      <button
                        onClick={deleteSelected}
                        disabled={readOnly || !selectedIds.length || bulkBusy}
                        className="danger"
                      >
                        {bulkBusy ? "Working…" : "Delete selected"}
                      </button>
                      <button
                        onClick={() => setSelectedIds([])}
                        disabled={readOnly || !selectedIds.length || bulkBusy}
                      >
                        {"Clear"}
                      </button>
                    </div>
                    {bulkProgress.length ? (
                      <>
                        <div className="bulk-progress">
                          <div>
                            <strong>
                              {"Bulk replay and forwarding progress"}
                            </strong>
                            <span>
                              {"Concurrency 3 · "}
                              {
                                bulkProgress.filter((item) =>
                                  ["complete", "failed"].includes(item.status),
                                ).length
                              }
                              {"/"}
                              {bulkProgress.length}
                              {" finished"}
                            </span>
                          </div>
                          <table>
                            <thead>
                              <tr>
                                <th>{"Request"}</th>
                                <th>{"Operation"}</th>
                                <th>{"Status"}</th>
                                <th>{"Result"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkProgress.map((item, _index0) => (
                                <Fragment key={item.id}>
                                  <tr>
                                    <td>
                                      <code>
                                        {item.method} {item.path}
                                      </code>
                                    </td>
                                    <td>{item.operation}</td>
                                    <td
                                      className={[item.status]
                                        .filter(Boolean)
                                        .join(" ")}
                                    >
                                      {item.status}
                                    </td>
                                    <td>{item.detail || "—"}</td>
                                  </tr>
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            {actionMessage ? (
              <>
                <p role="status" className="notice">
                  {actionMessage}
                </p>
              </>
            ) : null}
            {binView === "rules" ? (
              <>
                <section className="rules-panel">
                  <div className="rules-heading">
                    <div>
                      <h2>{"Conditional response rules"}</h2>
                      <p>
                        {
                          "Enabled rules run from top to bottom; the first match wins. All conditions within a rule must match."
                        }
                      </p>
                    </div>
                    <button disabled={readOnly} onClick={resetRuleForm}>
                      {"New rule"}
                    </button>
                  </div>
                  {rules.length ? (
                    <>
                      <ol className="rule-list">
                        {rules.map((rule, index) => (
                          <Fragment key={rule.id}>
                            <li
                              className={[!rule.enabled ? "disabled" : ""]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <span className="rule-priority">{index + 1}</span>
                              <div>
                                <strong>{rule.name}</strong>
                                <small>
                                  {rule.enabled ? "Enabled" : "Disabled"}
                                  {" · "}
                                  {rule.conditions.length}
                                  {" condition"}
                                  {rule.conditions.length === 1 ? "" : "s"}
                                  {" · HTTP "}
                                  {rule.responseStatus}
                                  {rule.responseDelayMs
                                    ? ` · ${rule.responseDelayMs} ms delay`
                                    : ""}
                                </small>
                              </div>
                              <button
                                aria-label="Move rule up"
                                onClick={() => moveRule(index, -1)}
                                disabled={readOnly || index === 0}
                              >
                                {"↑"}
                              </button>
                              <button
                                aria-label="Move rule down"
                                onClick={() => moveRule(index, 1)}
                                disabled={
                                  readOnly || index === rules.length - 1
                                }
                              >
                                {"↓"}
                              </button>
                              <button
                                disabled={readOnly}
                                onClick={() => editRule(rule)}
                              >
                                {"Edit"}
                              </button>
                              <button
                                disabled={readOnly}
                                onClick={() => deleteRule(rule)}
                                className="danger"
                              >
                                {"Delete"}
                              </button>
                            </li>
                          </Fragment>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <>
                      {" "}
                      <p className="rule-empty">
                        {
                          "No response rules yet. The bin fallback response is used for every capture."
                        }
                      </p>{" "}
                    </>
                  )}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveRule();
                    }}
                    className="rule-editor"
                  >
                    <h3>{editingRuleId ? "Edit rule" : "New rule"}</h3>
                    <div className="rule-grid">
                      <label>
                        {"Name"}
                        <input
                          disabled={readOnly}
                          maxLength={80}
                          required
                          placeholder="Successful checkout"
                          value={ruleName ?? ""}
                          onChange={(event) => {
                            setRuleName(event.currentTarget.value);
                          }}
                        />
                      </label>
                      <label className="rule-toggle">
                        <input
                          disabled={readOnly}
                          type="checkbox"
                          checked={ruleEnabled}
                          onChange={(event) => {
                            setRuleEnabled(event.currentTarget.checked);
                          }}
                        />
                        {" Enabled"}
                      </label>
                    </div>
                    <label>
                      {"Conditions (JSON; 1–5, all must match)"}
                      <textarea
                        disabled={readOnly}
                        rows={7}
                        value={ruleConditions ?? ""}
                        onChange={(event) => {
                          setRuleConditions(event.currentTarget.value);
                        }}
                      ></textarea>
                    </label>
                    <p className="rule-help">
                      {
                        "Sources: method, path, query, header, body. Operators: equals, exists, contains, glob. Query/header/body conditions require a key; body keys use dot paths."
                      }
                    </p>
                    <div className="rule-grid three">
                      <label>
                        {"Status"}
                        <input
                          disabled={readOnly}
                          type="number"
                          min="200"
                          max="599"
                          value={ruleStatus ?? ""}
                          onChange={(event) => {
                            setRuleStatus(Number(event.currentTarget.value));
                          }}
                        />
                      </label>
                      <label>
                        {"Delay (ms)"}
                        <input
                          disabled={readOnly}
                          type="number"
                          min="0"
                          max="5000"
                          value={ruleDelayMs ?? ""}
                          onChange={(event) => {
                            setRuleDelayMs(Number(event.currentTarget.value));
                          }}
                        />
                      </label>
                      <label>
                        {"Content type"}
                        <input
                          disabled={readOnly}
                          maxLength={500}
                          value={ruleContentType ?? ""}
                          onChange={(event) => {
                            setRuleContentType(event.currentTarget.value);
                          }}
                        />
                      </label>
                    </div>
                    <label>
                      {"Response headers (JSON)"}
                      <textarea
                        disabled={readOnly}
                        rows={3}
                        value={ruleHeaders ?? ""}
                        onChange={(event) => {
                          setRuleHeaders(event.currentTarget.value);
                        }}
                      ></textarea>
                    </label>
                    <label>
                      {"Response body"}
                      <textarea
                        disabled={readOnly}
                        rows={5}
                        value={ruleBody ?? ""}
                        onChange={(event) => {
                          setRuleBody(event.currentTarget.value);
                        }}
                      ></textarea>
                    </label>
                    <div className="rule-editor-actions">
                      <button disabled={readOnly} className="save">
                        {editingRuleId ? "Update rule" : "Create rule"}
                      </button>
                      {editingRuleId ? (
                        <>
                          <button
                            disabled={readOnly}
                            type="button"
                            onClick={resetRuleForm}
                          >
                            {"Cancel"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </form>
                  <div className="rule-tester">
                    <h3>{"Rule tester"}</h3>
                    <textarea
                      disabled={readOnly}
                      rows={8}
                      value={ruleTestInput ?? ""}
                      onChange={(event) => {
                        setRuleTestInput(event.currentTarget.value);
                      }}
                    ></textarea>
                    <button disabled={readOnly} onClick={testRules}>
                      {"Test enabled rules"}
                    </button>
                  </div>
                </section>
              </>
            ) : null}
            {binView === "histogram" ? (
              <RequestHistogram
                requests={interactions}
                loading={loading}
                error={error}
              />
            ) : null}
            {binView === "audit" ? (
              <>
                <section className="rules-panel">
                  <div className="rules-heading">
                    <div>
                      <h2>{"Mutation audit history"}</h2>
                      <p>
                        {
                          "The newest 500 events are retained. Sensitive request and configuration values are excluded."
                        }
                      </p>
                    </div>
                  </div>
                  {auditEvents.length ? (
                    <>
                      <ol className="rule-list">
                        {auditEvents.map((event, _index0) => (
                          <Fragment key={event.id}>
                            <li>
                              <div>
                                <strong>{event.action}</strong>
                                <small>
                                  {event.actorEmail || event.actorType}
                                  {" · "}
                                  {event.targetType}
                                  {event.targetId ? ` ${event.targetId}` : ""}
                                  {" · "}
                                  {new Date(event.createdAt).toLocaleString()}
                                </small>
                                {Object.keys(event.metadata || {}).length ? (
                                  <>
                                    <code>
                                      {JSON.stringify(event.metadata)}
                                    </code>
                                  </>
                                ) : null}
                              </div>
                            </li>
                          </Fragment>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <>
                      {" "}
                      <p className="rule-empty">
                        {"No mutation events have been recorded for this bin."}
                      </p>{" "}
                    </>
                  )}
                </section>
              </>
            ) : null}
            {binView === "config" ? (
              <>
                <div className="config-actions">
                  <button disabled={readOnly} onClick={exportConfig}>
                    {"Export config"}
                  </button>
                  <label className="config-import">
                    {"Import config"}
                    <input
                      disabled={readOnly}
                      type="file"
                      accept="application/json,.json"
                      onChange={importConfig}
                    />
                  </label>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveSettings();
                  }}
                  className="response-settings"
                >
                  <div>
                    <label>
                      {"Status"}
                      <input
                        disabled={readOnly}
                        type="number"
                        min="100"
                        max="599"
                        value={responseStatus ?? ""}
                        onChange={(event) => {
                          setResponseStatus(Number(event.currentTarget.value));
                        }}
                      />
                    </label>
                    <label>
                      {"Content type "}
                      <span className="field-limit">
                        {responseBytes(responseContentType)}
                        {"/500 bytes"}
                      </span>
                      <input
                        disabled={readOnly}
                        maxLength={500}
                        value={responseContentType ?? ""}
                        onChange={(event) => {
                          setResponseContentType(event.currentTarget.value);
                        }}
                      />
                    </label>
                  </div>
                  <label>
                    {"Response headers (JSON) "}
                    <span className="field-limit">
                      {responseBytes(responseHeaders)}
                      {"/500 bytes"}
                    </span>
                    <textarea
                      disabled={readOnly}
                      maxLength={500}
                      rows={4}
                      value={responseHeaders ?? ""}
                      onChange={(event) => {
                        setResponseHeaders(event.currentTarget.value);
                      }}
                    ></textarea>
                  </label>
                  <label>
                    {"Response body "}
                    <span className="field-limit">
                      {responseBytes(responseBody)}
                      {"/500 bytes"}
                    </span>
                    <textarea
                      disabled={readOnly}
                      maxLength={500}
                      rows={6}
                      value={responseBody ?? ""}
                      onChange={(event) => {
                        setResponseBody(event.currentTarget.value);
                      }}
                    ></textarea>
                  </label>
                  <fieldset className="forwarding-settings">
                    <legend>{"Automatic forwarding"}</legend>
                    <label className="forwarding-toggle">
                      <input
                        disabled={readOnly}
                        type="checkbox"
                        checked={forwardingEnabled}
                        onChange={(event) => {
                          setForwardingEnabled(event.currentTarget.checked);
                        }}
                      />
                      {" Forward new captures after storing them"}
                    </label>
                    <label>
                      {"Destination base URL"}
                      <input
                        type="url"
                        maxLength={2000}
                        placeholder="https://api.example.com/webhooks"
                        disabled={readOnly || !forwardingEnabled}
                        value={forwardingUrl ?? ""}
                        onChange={(event) => {
                          setForwardingUrl(event.currentTarget.value);
                        }}
                      />
                    </label>
                    <label>
                      {"Auth headers to retain (comma-separated)"}
                      <input
                        placeholder="stripe-signature, x-api-key"
                        disabled={readOnly || !forwardingEnabled}
                        value={forwardingAuthHeaders ?? ""}
                        onChange={(event) => {
                          setForwardingAuthHeaders(event.currentTarget.value);
                        }}
                      />
                    </label>
                    <div className="forwarding-conditions">
                      <h3>{"Forward only when"}</h3>
                      <p>
                        {
                          "All conditions must match. With no conditions, every new capture is forwarded. Up to five conditions are allowed."
                        }
                      </p>
                      {forwardingConditions.map((condition, index) => (
                        <Fragment key={index}>
                          <fieldset className="forwarding-condition">
                            <legend>
                              {"Condition "}
                              {index + 1}
                            </legend>
                            <label>
                              {"Request field"}
                              <select
                                disabled={readOnly || !forwardingEnabled}
                                value={condition.source ?? ""}
                                onChange={(event) => {
                                  const value = event.currentTarget.value;
                                  setForwardingConditions((previous) =>
                                    previous.map((entry, i) =>
                                      i === index
                                        ? { ...entry, source: value }
                                        : entry,
                                    ),
                                  );
                                }}
                              >
                                <option value="method">{"Method"}</option>
                                <option value="path">{"Path"}</option>
                                <option value="query">
                                  {"Query parameter"}
                                </option>
                                <option value="header">{"Header"}</option>
                                <option value="body">
                                  {"JSON / form field"}
                                </option>
                              </select>
                            </label>
                            {["query", "header", "body"].includes(
                              condition.source,
                            ) ? (
                              <>
                                <label>
                                  {"Field name"}
                                  <input
                                    maxLength={500}
                                    placeholder={
                                      condition.source === "body"
                                        ? "data.status"
                                        : condition.source === "header"
                                          ? "x-event"
                                          : "event"
                                    }
                                    disabled={readOnly || !forwardingEnabled}
                                    required
                                    value={condition.key ?? ""}
                                    onChange={(event) => {
                                      const value = event.currentTarget.value;
                                      setForwardingConditions((previous) =>
                                        previous.map((entry, i) =>
                                          i === index
                                            ? { ...entry, key: value }
                                            : entry,
                                        ),
                                      );
                                    }}
                                  />
                                </label>
                              </>
                            ) : null}
                            <label>
                              {"Match"}
                              <select
                                disabled={readOnly || !forwardingEnabled}
                                value={condition.operator ?? ""}
                                onChange={(event) => {
                                  const value = event.currentTarget.value;
                                  setForwardingConditions((previous) =>
                                    previous.map((entry, i) =>
                                      i === index
                                        ? { ...entry, operator: value }
                                        : entry,
                                    ),
                                  );
                                }}
                              >
                                <option value="equals">{"Equals"}</option>
                                <option value="exists">{"Exists"}</option>
                                <option value="contains">{"Contains"}</option>
                                <option value="glob">{"Glob (* and ?)"}</option>
                              </select>
                            </label>
                            {condition.operator !== "exists" ? (
                              <>
                                <label>
                                  {"Value"}
                                  <input
                                    maxLength={500}
                                    placeholder={
                                      condition.source === "method"
                                        ? "POST"
                                        : condition.source === "path"
                                          ? "/webhooks/*"
                                          : "invoice.created"
                                    }
                                    disabled={readOnly || !forwardingEnabled}
                                    value={condition.value ?? ""}
                                    onChange={(event) => {
                                      const value = event.currentTarget.value;
                                      setForwardingConditions((previous) =>
                                        previous.map((entry, i) =>
                                          i === index
                                            ? { ...entry, value: value }
                                            : entry,
                                        ),
                                      );
                                    }}
                                  />
                                </label>
                              </>
                            ) : null}
                            <button
                              type="button"
                              disabled={readOnly || !forwardingEnabled}
                              onClick={() =>
                                setForwardingConditions((previous) =>
                                  previous.filter((_, i) => i !== index),
                                )
                              }
                            >
                              {"Remove condition"}
                            </button>
                          </fieldset>
                        </Fragment>
                      ))}
                      <button
                        type="button"
                        disabled={
                          readOnly ||
                          !forwardingEnabled ||
                          forwardingConditions.length >= 5
                        }
                        onClick={() =>
                          setForwardingConditions((previous) => [
                            ...previous,
                            {
                              source: "method",
                              key: "",
                              operator: "equals",
                              value: "POST",
                            },
                          ])
                        }
                      >
                        {"Add condition"}
                      </button>
                      <p>
                        {
                          "Methods use uppercase values; header names are case-insensitive. JSON fields use dot notation. Authorization and cookie headers cannot be matched. Compressed bodies cannot match body conditions. Manual and bulk forwarding ignore these automatic-forwarding conditions."
                        }
                      </p>
                    </div>
                    <p>
                      {
                        "The captured path and query are appended to this URL. Delivery is best-effort with a 10-second timeout and no retries. Capture responses do not wait for forwarding."
                      }
                    </p>
                    <p>
                      <strong>{"Authorization is always removed"}</strong>
                      {
                        " because it contains the Freebin API key. Other credential-like headers are stripped unless explicitly named above."
                      }
                    </p>
                  </fieldset>
                  <button
                    disabled={readOnly || savingSettings}
                    className="save"
                  >
                    {savingSettings ? "Saving…" : "Save settings"}
                  </button>
                </form>
              </>
            ) : null}
            {binView === "delete" ? (
              <form
                className="delete-bin-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  void deleteBin();
                }}
              >
                <p>
                  {
                    "Deleting this bin removes every captured request. This cannot be undone."
                  }
                </p>
                <label htmlFor="delete-bin-confirmation">
                  {"Type "}
                  <strong>{binName || "the bin name"}</strong>
                  {" to confirm"}
                </label>
                <input
                  id="delete-bin-confirmation"
                  autoComplete="off"
                  spellCheck={false}
                  value={deleteConfirmation}
                  disabled={readOnly || !binName || deletingBin}
                  onChange={(event) =>
                    setDeleteConfirmation(event.currentTarget.value)
                  }
                />
                <button
                  className="danger"
                  disabled={
                    readOnly ||
                    !binName ||
                    deleteConfirmation !== binName ||
                    deletingBin
                  }
                >
                  {deletingBin ? "Deleting…" : "Delete bin"}
                </button>
              </form>
            ) : null}
            {binView !== "requests" ? null : loading ? (
              <>
                <p className="empty">{"Waiting for the edge…"}</p>
              </>
            ) : (
              <>
                {" "}
                {error ? (
                  <>
                    <p className="empty error">{error}</p>
                  </>
                ) : (
                  <>
                    {" "}
                    {!interactions.length ? (
                      <>
                        <div className="blank">
                          <div className="pulse"></div>
                          <h1>{"Your endpoint is listening"}</h1>
                          <p>{"Try this from a terminal:"}</p>
                          <pre>
                            {"curl -X POST "}
                            {endpoint}
                            {" \\"}
                            <br />
                            {'  -H "authorization: Bearer YOUR_API_KEY" \\'}
                            <br />
                            {'  -H "content-type: application/json" \\'}
                            <br />
                            {'  -d \'{"hello":"edge"}\''}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <>
                        <div ref={requestListElement} className="request-list">
                          {pagedInteractions.map((item, _index0) => (
                            <Fragment key={item.id}>
                              <article
                                className={[
                                  "request-item",
                                  expandedId === item.id ? "expanded" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <input
                                  disabled={readOnly}
                                  type="checkbox"
                                  checked={selectedIds.includes(item.id)}
                                  aria-label={`Select ${item.method} ${item.path}`}
                                  className="select-request"
                                  onChange={() => toggleSelection(item.id)}
                                />
                                <button
                                  aria-expanded={expandedId === item.id}
                                  aria-controls={`request-details-${item.id}`}
                                  onClick={() => toggleDetails(item.id)}
                                  className="request-row"
                                >
                                  <span aria-hidden="true" className="chevron">
                                    {"›"}
                                  </span>
                                  <span
                                    className={[
                                      "method " + item.method.toLowerCase(),
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    {item.method}
                                  </span>
                                  <span className="path">{item.path}</span>
                                  <time>
                                    {new Date(
                                      item.timestamp,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </time>
                                </button>
                                {expandedId === item.id ? (
                                  <>
                                    <div
                                      id={`request-details-${item.id}`}
                                      className="request-details"
                                    >
                                      <div className="detail-meta">
                                        <span>{"Captured"}</span>
                                        <time>
                                          {new Date(
                                            item.timestamp,
                                          ).toLocaleString()}
                                        </time>
                                        {item.forwardStatus ? (
                                          <>
                                            <span
                                              className={[
                                                "forward-status " +
                                                  item.forwardStatus,
                                              ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            >
                                              {"Forward "}
                                              {item.forwardStatus}
                                              {item.forwardStatusCode
                                                ? ` · ${item.forwardStatusCode}`
                                                : ""}
                                              {item.forwardDurationMs !==
                                                null &&
                                              item.forwardDurationMs !==
                                                undefined
                                                ? ` · ${item.forwardDurationMs} ms`
                                                : ""}
                                            </span>
                                          </>
                                        ) : null}
                                        {item.matchedRuleId ? (
                                          <>
                                            <span className="matched-rule">
                                              {"Rule · "}
                                              {item.matchedRuleName ||
                                                item.matchedRuleId}
                                              {" · rev "}
                                              {item.matchedRuleRevision}
                                            </span>
                                          </>
                                        ) : null}
                                      </div>
                                      {item.forwardError ? (
                                        <>
                                          <p className="forward-error">
                                            {item.forwardError}
                                          </p>
                                        </>
                                      ) : null}
                                      <div className="detail-grid">
                                        <section>
                                          <h2>{"Headers"}</h2>
                                          <pre>
                                            {JSON.stringify(
                                              item.headers,
                                              null,
                                              2,
                                            )}
                                          </pre>
                                        </section>
                                        <section>
                                          <h2>{"Query parameters"}</h2>
                                          <pre>
                                            {JSON.stringify(
                                              item.query,
                                              null,
                                              2,
                                            )}
                                          </pre>
                                        </section>
                                        <section className="body">
                                          <RequestBody
                                            readOnly={readOnly}
                                            body={item.body}
                                            headers={item.headers}
                                          ></RequestBody>
                                        </section>
                                      </div>
                                      <section className="replay replay-editor">
                                        <div className="replay-heading">
                                          <div>
                                            <h2>{"Edit and replay"}</h2>
                                            <p>
                                              {
                                                "The original capture remains unchanged. Authorization, cookies, API keys, signatures, and hop-by-hop headers are stripped."
                                              }
                                            </p>
                                          </div>
                                          <button
                                            disabled={readOnly}
                                            onClick={() =>
                                              initializeReplay(item)
                                            }
                                          >
                                            {"Restore capture"}
                                          </button>
                                        </div>
                                        <div className="replay-target">
                                          <label>
                                            <span>
                                              {"Destination HTTPS origin"}
                                            </span>
                                            <input
                                              disabled={readOnly}
                                              type="url"
                                              placeholder="https://api.example.com"
                                              value={replayUrl ?? ""}
                                              onChange={(event) => {
                                                setReplayUrl(
                                                  event.currentTarget.value,
                                                );
                                              }}
                                            />
                                          </label>
                                          <label>
                                            {"Method"}
                                            <input
                                              disabled={readOnly}
                                              maxLength={32}
                                              value={replayMethod ?? ""}
                                              onChange={(event) => {
                                                setReplayMethod(
                                                  event.currentTarget.value,
                                                );
                                              }}
                                            />
                                          </label>
                                          <label>
                                            {"Path"}
                                            <input
                                              disabled={readOnly}
                                              placeholder="/webhooks"
                                              value={replayPath ?? ""}
                                              onChange={(event) => {
                                                setReplayPath(
                                                  event.currentTarget.value,
                                                );
                                              }}
                                            />
                                          </label>
                                        </div>
                                        <div className="replay-fields">
                                          <label>
                                            {"Query (JSON)"}
                                            <textarea
                                              disabled={readOnly}
                                              rows={6}
                                              value={replayQuery ?? ""}
                                              onChange={(event) => {
                                                setReplayQuery(
                                                  event.currentTarget.value,
                                                );
                                              }}
                                            ></textarea>
                                          </label>
                                          <label>
                                            {"Headers (JSON)"}
                                            <textarea
                                              disabled={readOnly}
                                              rows={6}
                                              value={replayHeaders ?? ""}
                                              onChange={(event) => {
                                                setReplayHeaders(
                                                  event.currentTarget.value,
                                                );
                                              }}
                                            ></textarea>
                                          </label>
                                          <label className="replay-body">
                                            {"Body"}
                                            <textarea
                                              disabled={readOnly}
                                              rows={7}
                                              value={replayBody ?? ""}
                                              onChange={(event) => {
                                                setReplayBody(
                                                  event.currentTarget.value,
                                                );
                                              }}
                                            ></textarea>
                                          </label>
                                        </div>
                                        <div className="curl-preview">
                                          <div>
                                            <strong>{"Generated curl"}</strong>
                                            <button
                                              disabled={readOnly}
                                              onClick={copyCurl}
                                            >
                                              {curlCopied
                                                ? "Copied!"
                                                : "Copy curl"}
                                            </button>
                                          </div>
                                          <pre>{curlCommand()}</pre>
                                        </div>
                                        <div className="replay-actions">
                                          <button
                                            onClick={() => replay(item)}
                                            disabled={
                                              readOnly ||
                                              !replayUrl ||
                                              replayBusy
                                            }
                                          >
                                            {replayBusy
                                              ? "Replaying…"
                                              : "Replay edited request"}
                                          </button>
                                          <button
                                            disabled={readOnly}
                                            onClick={() => exportRequest(item)}
                                          >
                                            {"Export request"}
                                          </button>
                                          <button
                                            disabled={readOnly}
                                            onClick={() =>
                                              toggleRequestShare(item)
                                            }
                                          >
                                            {item.publicShareToken
                                              ? "Unshare request"
                                              : "Share request"}
                                          </button>
                                          <button
                                            disabled={readOnly}
                                            onClick={() => deleteRequest(item)}
                                            className="danger"
                                          >
                                            {"Delete request"}
                                          </button>
                                        </div>
                                        {item.publicShareToken ? (
                                          <>
                                            <small className="share-url">
                                              {"Shared at "}
                                              <a
                                                href={sharedRequestUrl(item)}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                {sharedRequestUrl(item)}
                                              </a>
                                            </small>
                                          </>
                                        ) : null}
                                        <div className="replay-history">
                                          <h2>
                                            {"Automatic forwarding attempts "}
                                            <span>
                                              {forwardAttempts.length}
                                            </span>
                                          </h2>
                                          {forwardAttempts.length ? (
                                            <>
                                              <ol>
                                                {forwardAttempts.map(
                                                  (attempt, _index0) => (
                                                    <Fragment key={attempt.id}>
                                                      <li>
                                                        <span
                                                          className={[
                                                            attempt.status ===
                                                            "failed"
                                                              ? "error"
                                                              : "",
                                                          ]
                                                            .filter(Boolean)
                                                            .join(" ")}
                                                        >
                                                          {"Attempt "}
                                                          {
                                                            attempt.attemptNumber
                                                          }
                                                          {" · "}
                                                          {attempt.status ===
                                                          "delivered"
                                                            ? `HTTP ${attempt.responseStatus}`
                                                            : attempt.status}
                                                        </span>
                                                        <code>
                                                          {attempt.targetUrl ||
                                                            "Legacy destination unavailable"}
                                                        </code>
                                                        <small>
                                                          {"Started "}
                                                          {new Date(
                                                            attempt.startedAt,
                                                          ).toLocaleString()}
                                                          {attempt.completedAt
                                                            ? ` · completed ${new Date(attempt.completedAt).toLocaleString()}`
                                                            : ""}
                                                          {attempt.durationMs !==
                                                          null
                                                            ? ` · ${attempt.durationMs} ms`
                                                            : ""}
                                                        </small>
                                                        {attempt.error ? (
                                                          <>
                                                            <p>
                                                              {attempt.error}
                                                            </p>
                                                          </>
                                                        ) : null}
                                                      </li>
                                                    </Fragment>
                                                  ),
                                                )}
                                              </ol>
                                            </>
                                          ) : (
                                            <>
                                              {" "}
                                              <p>
                                                {
                                                  "No automatic forwarding attempts for this capture."
                                                }
                                              </p>{" "}
                                            </>
                                          )}
                                        </div>
                                        <div className="replay-history">
                                          <h2>
                                            {"Replay attempts "}
                                            <span>{replayAttempts.length}</span>
                                          </h2>
                                          {replayAttempts.length ? (
                                            <>
                                              <ol>
                                                {replayAttempts.map(
                                                  (attempt, _index0) => (
                                                    <Fragment key={attempt.id}>
                                                      <li>
                                                        <span
                                                          className={[
                                                            attempt.error
                                                              ? "error"
                                                              : "",
                                                          ]
                                                            .filter(Boolean)
                                                            .join(" ")}
                                                        >
                                                          {attempt.operation ===
                                                          "forward"
                                                            ? "Forward"
                                                            : "Replay"}
                                                          {" · "}
                                                          {attempt.error
                                                            ? "Failed"
                                                            : `HTTP ${attempt.responseStatus}`}
                                                        </span>
                                                        <code>
                                                          {attempt.method}{" "}
                                                          {attempt.targetUrl}
                                                        </code>
                                                        <small>
                                                          {attempt.durationMs}
                                                          {" ms · "}
                                                          {new Date(
                                                            attempt.createdAt,
                                                          ).toLocaleString()}
                                                        </small>
                                                        {attempt.error ? (
                                                          <>
                                                            <p>
                                                              {attempt.error}
                                                            </p>
                                                          </>
                                                        ) : null}
                                                      </li>
                                                    </Fragment>
                                                  ),
                                                )}
                                              </ol>
                                            </>
                                          ) : (
                                            <>
                                              {" "}
                                              <p>
                                                {
                                                  "No replay or forwarding attempts for this capture."
                                                }
                                              </p>{" "}
                                            </>
                                          )}
                                        </div>
                                      </section>
                                    </div>
                                  </>
                                ) : null}
                              </article>
                            </Fragment>
                          ))}
                          {!filteredInteractions.length ? (
                            <>
                              <p className="empty">
                                {"No requests match these filters."}
                              </p>
                            </>
                          ) : null}
                        </div>
                        {filteredInteractions.length ? (
                          <>
                            <nav
                              aria-label="Request results pages"
                              className="pagination"
                            >
                              <div className="page-summary">
                                <strong>
                                  {"Page "}
                                  {currentPage}
                                  {" of "}
                                  {totalPages}
                                </strong>
                                <span>
                                  {"Showing "}
                                  {firstResult}
                                  {"–"}
                                  {lastResult}
                                  {" of "}
                                  {filteredInteractions.length}
                                  {" requests"}
                                </span>
                              </div>
                              {pageSize !== "all" ? (
                                <>
                                  <div className="page-links">
                                    <a
                                      aria-disabled={currentPage === 1}
                                      href={stateUrl(currentPage - 1)}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        if (currentPage > 1)
                                          goToPage(currentPage - 1);
                                      }}
                                      className={[
                                        "page-direction",
                                        currentPage === 1 ? "disabled" : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    >
                                      {"← "}
                                      <span>{"Previous"}</span>
                                    </a>
                                    {pageNumbers.map((page, _index0) => (
                                      <Fragment key={_index0}>
                                        {page === "ellipsis" ? (
                                          <>
                                            <span
                                              aria-hidden="true"
                                              className="page-ellipsis"
                                            >
                                              {"…"}
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <a
                                              aria-label={`Page ${page}`}
                                              aria-current={
                                                page === currentPage
                                                  ? "page"
                                                  : undefined
                                              }
                                              href={stateUrl(page)}
                                              onClick={(event) => {
                                                event.preventDefault();
                                                goToPage(page);
                                              }}
                                              className={[
                                                page === currentPage
                                                  ? "current"
                                                  : "",
                                              ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            >
                                              {page}
                                            </a>
                                          </>
                                        )}
                                      </Fragment>
                                    ))}
                                    <a
                                      aria-disabled={currentPage === totalPages}
                                      href={stateUrl(currentPage + 1)}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        if (currentPage < totalPages)
                                          goToPage(currentPage + 1);
                                      }}
                                      className={[
                                        "page-direction",
                                        currentPage === totalPages
                                          ? "disabled"
                                          : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    >
                                      <span>{"Next"}</span>
                                      {" →"}
                                    </a>
                                  </div>
                                </>
                              ) : null}
                            </nav>
                          </>
                        ) : null}
                      </>
                    )}{" "}
                  </>
                )}{" "}
              </>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
