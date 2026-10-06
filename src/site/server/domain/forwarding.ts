import { matchesRule, validateConditions, type MatchContext } from "./rules";

export function validateForwardingConditions(input: unknown) {
  return validateConditions(input, true);
}

// A malformed stored policy must never turn conditional forwarding into forward-all.
export function matchesForwardingConditions(
  stored: unknown,
  context: MatchContext,
) {
  try {
    return matchesRule(
      validateForwardingConditions(JSON.parse(String(stored))),
      context,
    );
  } catch {
    return false;
  }
}
