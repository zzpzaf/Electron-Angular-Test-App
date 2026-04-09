/**
 * Utility for parsing multi-grouped-links text and matching group labels to categories.
 * Handles detection, grouping, and intelligent category assignment based on text labels.
 */

/**
 * A group of links that share a common header/label and category.
 * - header: the raw label text found in the pasted text, or "orphan" for links
 *   that appear before any label.
 * - categoryId: initially the mother-category ID; updated to matching child-category
 *   ID when the header matches a child category name.
 * - urls: canonical form of every URL that belongs to this group.
 */
export interface LinkGroup {
  header: string;
  categoryId: number;
  urls: string[];
}

export interface MultiGroupedLinksParseResult {
  isMultiGrouped: boolean;    // true when at least one real (non-orphan) label group with URLs exists
  groups: LinkGroup[];        // all groups in parse order
}

/**
 * Removes all blank/whitespace-only lines from raw text.
 * Also removes divider-only lines made of hyphens (e.g. "-----").
 * Applied immediately on clipboard data before any other processing.
 */
export function removeBlankLines(text: string): string {
  const isHyphenDividerLine = (line: string): boolean => /^-+$/.test(line);

  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isHyphenDividerLine(line))
    .join('\n');
}

/** Returns true when the line looks like an http/https URL. */
function isUrlLine(line: string): boolean {
  return line.startsWith('http://') || line.startsWith('https://');
}

/**
 * Normalizes text for category matching:
 * lowercase, strip non-alphanumeric, collapse spaces.
 *
 * "WHERE, GROUP BY, & HAVING" → "where group by having"
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toWords(text: string): string[] {
  return normalizeForMatch(text).split(' ').filter((w) => w.length > 0);
}

function wordsAreContiguousSubsequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Best-effort match of a label string against the child-category names map.
 * Priority:  exact normalized phrase  >  contiguous word sequence  >  all words present
 * Returns the matching categoryId or undefined.
 */
function matchLabelToChildCategory(
  label: string,
  childCategories: Map<number, string>
): number | undefined {
  const labelNorm = normalizeForMatch(label);
  const labelWords = toWords(label);
  if (!labelNorm) return undefined;

  let bestId: number | undefined;
  let bestScore = -1;

  for (const [id, name] of childCategories) {
    const nameNorm = normalizeForMatch(name);
    const nameWords = toWords(name);
    if (!nameNorm) continue;

    let score = -1;
    if (labelNorm === nameNorm) {
      score = 1000 + nameWords.length;
    } else if (wordsAreContiguousSubsequence(labelWords, nameWords)) {
      score = 800 + nameWords.length;
    } else if (nameWords.every((w) => labelWords.includes(w))) {
      score = 600 + nameWords.length;
    }

    if (score > bestScore) { bestScore = score; bestId = id; }
  }
  return bestId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses blank-line-free text into an ordered array of LinkGroups.
 *
 * Algorithm
 * ─────────
 * 1. Strip blank lines (so they cannot interrupt a group or create false labels).
 * 2. Walk lines top-to-bottom.
 *    • URL line  → append to the *current* group's url list.
 *    • Text line → flush the current group (if it has URLs), start a new group
 *                  with this text as header.
 * 3. Any URLs appearing before the first text-label are collected into an
 *    "orphan" group at position 0.
 * 4. After all groups are built, iterate each group's header against the child
 *    categories and update categoryId on a match.
 * 5. isMultiGrouped = true when there is at least one non-orphan group with URLs.
 */
export function parseMultiGroupedLinks(
  rawText: string,
  motherCategoryId: number,
  childCategories: Map<number, string>
): MultiGroupedLinksParseResult {

  const lines = removeBlankLines(rawText).split('\n');
  if (lines.length === 0) {
    return { isMultiGrouped: false, groups: [] };
  }

  // ── Step 1: build raw groups ──────────────────────────────────────────────
  const groups: LinkGroup[] = [];

  // Current in-flight group (starts as the implicit orphan bucket).
  let currentHeader = 'orphan';
  let currentUrls: string[] = [];
  let hasRealLabel = false; // becomes true once we see a non-URL label line

  const flushGroup = () => {
    if (currentUrls.length > 0) {
      groups.push({
        header: currentHeader,
        categoryId: motherCategoryId,  // will be resolved in step 2
        urls: [...currentUrls],
      });
    }
    currentUrls = [];
  };

  for (const line of lines) {
    if (isUrlLine(line)) {
      currentUrls.push(line);
    } else {
      // Text label – flush whatever was buffered, then start new group.
      flushGroup();
      currentHeader = line;
      hasRealLabel = true;
    }
  }
  flushGroup(); // flush last group

  // ── Step 2: match each group's header to a child category ─────────────────
  let labelGroupsWithUrls = 0;
  for (const group of groups) {
    if (group.header === 'orphan') continue;
    const matchedId = matchLabelToChildCategory(group.header, childCategories);
    if (matchedId !== undefined) {
      group.categoryId = matchedId;
    }
    if (group.urls.length > 0) labelGroupsWithUrls++;
  }

  // isMultiGrouped: there is at least one real (non-orphan) label group with URLs.
  const isMultiGrouped = hasRealLabel && labelGroupsWithUrls >= 1;

  return { isMultiGrouped, groups };
}
