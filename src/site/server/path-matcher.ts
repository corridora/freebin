export function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const expected = pattern.split("/").filter(Boolean),
    actual = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    const part = expected[i];
    if (part.startsWith("[...")) {
      params[part.slice(4, -1)] = actual
        .slice(i)
        .map(decodeURIComponent)
        .join("/");
      return params;
    }
    if (actual[i] === undefined) return null;
    if (part.startsWith("["))
      params[part.slice(1, -1)] = decodeURIComponent(actual[i]);
    else if (part !== actual[i]) return null;
  }
  return expected.length === actual.length ? params : null;
}
