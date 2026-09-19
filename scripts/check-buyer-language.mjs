// Buyer-language check (Section 10 + 12). Fails CI if a banned internal term
// appears in customer-facing UI text. This is a heuristic scan of visible JSX
// string content in src/screens and src/components.
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/screens", "src/components"];
const BANNED = [
  "aggregation",
  "selector",
  "canonical",
  "data model",
  "source of truth",
  "amortization",
  "compounding",
  "contribution timing",
  "domain engine",
  "calculation engine",
  "schemaVersion", // never surfaced to users
  // Phase 2 internal terms — the UI says "repeating", "bill", "coming up" instead.
  "recurrence",
  "occurrence",
  "projection",
  "engine",
  "rule",
  // Phase 3 internal terms — the UI says "Planned", "Spent", "Left", "Left to assign".
  "variance",
  "template",
  "period line",
  // Phase 4 internal terms — the UI says "Debt-free date", "Interest you'll pay",
  // "Pay off highest-rate first" / "Pay off smallest first", "Keep a cushion of…".
  "amortization",
  "principal",
  "snowball",
  "avalanche",
];

// Allowlist: files/paths that are internal-only tooling, if any.
const IGNORE = [];

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

// Pull out visible text: strings inside JSX ( >...< ) and common label props.
function visibleText(src) {
  const chunks = [];
  const jsxText = src.match(/>[^<>{}]+</g) || [];
  for (const t of jsxText) chunks.push(t.slice(1, -1));
  const labelProps = src.match(/(?:placeholder|title|aria-label|label)=\{?["'`]([^"'`]+)["'`]/g) || [];
  for (const t of labelProps) chunks.push(t);
  return chunks.join("\n").toLowerCase();
}

const files = ROOTS.flatMap((r) => walk(r, []));
const problems = [];
for (const file of files) {
  if (IGNORE.some((i) => file.includes(i))) continue;
  const text = visibleText(fs.readFileSync(file, "utf8"));
  for (const term of BANNED) {
    if (text.includes(term.toLowerCase())) {
      problems.push(`${file}: banned term "${term}" in visible text`);
    }
  }
}

if (problems.length) {
  console.error("Buyer-language check FAILED:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`Buyer-language check passed (${files.length} files scanned).`);
