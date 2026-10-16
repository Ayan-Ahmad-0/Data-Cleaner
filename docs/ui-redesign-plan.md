# UI Redesign Plan: Quiet Editorial Data-Tool Experience

## 1. Objectives & Principles
- **Aesthetic**: Calm, editorial, data-tool design inspired by Linear, Stripe Dashboard, and Plausible. Content first, chrome second.
- **Audience**: Non-technical analysts and junior engineers. Eliminates unprompted engine jargon (DuckDB, CTE, Parquet text staging) from primary copy.
- **Typography & Color**: Self-hosted IBM Plex Sans (body & headings) and IBM Plex Mono (numbers, column names, code, metrics). Warm off-white background, near-black text, single deep ink-blue accent, and semantic status colors reserved strictly for real data status.
- **Single Source of Truth**: Design tokens defined in a single location (`src/tokens.css` and `src/tokens.ts`), with zero hardcoded hex colors, arbitrary border radii, or box-shadows in components. Product name centralized in `src/config.ts`.

---

## 2. Issues Observed in Baseline Audit
1. **Global Shell & Stepper**:
   - Stepper clipped at the right edge on standard and narrow viewports.
   - Ambiguous step indicators (multiple steps appeared selected/highlighted simultaneously).
   - Inconsistent container max-widths across pages (`max-w-3xl`, `max-w-5xl`, `max-w-xl`).
2. **Profile & Report Screen**:
   - Raw markdown syntax (`###`, `**`, backticks) rendered as unparsed plaintext strings.
   - Four identical stat cards with equal visual weight, showing jargon ("Vectorized scan", "100% scanned").
   - Erroneous status derivation: Columns with ~4% null values labeled "Clean" because `meta.nulls > 0` was omitted from anomaly detection.
   - Misleading status colors: 0 duplicate records colored in warning amber; scan duration colored green.
   - Lack of density and controls for wide tables (no "Issues only" filter or sticky header).
3. **Approval Screen (Centerpiece)**:
   - 60% empty whitespace under two small disconnected cards.
   - Purely read-only rules list with raw backticks: user cannot toggle rules or modify parameters.
   - Unhandled dummy confirmation radio buttons that did not mutate state.
   - Engine configuration card ("4.0 GB Memory", "4 Cores") occupied high-priority screen real estate.
   - Absence of an explicit "What will change" projection derived from profile numbers.
4. **Progress Screen**:
   - Generic progress bar with artificial jumps and technical text ("Intermediate spills to temporary disk").
   - Lack of screen-reader `aria-live` status announcements and missing stage indicators.
5. **Results Screen**:
   - Automated tests buried in a two-column card without failure-first prioritization.
   - Raw delta integers without human-readable explanation of why rows were removed.

---

## 3. Design System & Token Inventory

### Foundations
- **Font Stack**:
  - Sans: `@fontsource/ibm-plex-sans` (400, 500, 600)
  - Mono: `@fontsource/ibm-plex-mono` (400, 500, 600, tabular figures)
- **Scale**:
  - Font sizes: 11px (micro), 12px (caption/tag), 13px (body small/table), 14px (body), 16px (subhead), 20px (title), 24px (headline).
  - Radii: 4px (`--radius-sm`), 6px (`--radius-md`). No pill badges or rounded-2xl cards.
  - Spacing: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px.
- **Palette**:
  - `--bg-canvas`: `#FAFAF8` (warm off-white)
  - `--bg-surface`: `#FFFFFF`
  - `--bg-surface-subtle`: `#F4F4F1`
  - `--text-primary`: `#18181B` (near black, high contrast)
  - `--text-secondary`: `#52525B`
  - `--text-muted`: `#71717A`
  - `--border-hairline`: `#E4E4E7`
  - `--border-active`: `#A1A1AA`
  - `--accent`: `#1D4ED8` (deep ink blue)
  - `--accent-hover`: `#1E40AF`
  - `--status-ok`: `#15803D`
  - `--status-ok-bg`: `#F0FDF4`
  - `--status-warn`: `#B45309`
  - `--status-warn-bg`: `#FFFBEB`
  - `--status-danger`: `#B91C1C`
  - `--status-danger-bg`: `#FEF2F2`

### Component Inventory (`src/components/ui/`)
1. `Button`: Primary (deep ink), Secondary (hairline outline), Ghost, Danger. Visible `:focus-visible` ring.
2. `Badge` / `Tag`: Inferred type tag, issue severity tag (ok, warn, error). Sentence case, subtle hairline border.
3. `Toggle`: Accessible switch for rule inclusion/exclusion.
4. `Disclosure`: Clean accordion with hairline separator for technical engine details.
5. `SummaryStrip`: Inline segmented stat strip with vertical dividers.
6. `Callout`: Alert banner for required confirmations and audit warnings.
7. `Skeleton`: Content-shaped placeholder bars during loading and drafting.
8. `MarkdownRenderer`: Safe markdown view with raw HTML disabled, custom styling mapped to design tokens.
9. `Stepper`: Compact, non-clipping multi-step navigation with accessible done/active states.

---

## 4. Screen-by-Screen Specification

### Global Shell (`Navbar.tsx` & `App.tsx`)
- Centralized product title from `src/config.ts` (`APP_NAME`).
- Adaptive file metadata chip: e.g., `dirty_events.csv · 613 KB · 10,600 rows`.
- Responsive stepper: Completed steps are clickable links; active step highlighted with hairline accent indicator; upcoming steps muted; gracefully scrolls or collapses on mobile (<640px).

### 1. Upload Page
- Clean, focused dropzone with hairline dashed border and clear file format badge (`.csv up to 10 GB`).
- Inline Privacy Mode toggle with plain-English explanation: *"When enabled, statistical profiles are transmitted without sample rows or individual data values."*
- Client-side validation: instant rejection for non-CSV files and zero-byte files with contextual error recovery.
- Animated loading skeleton when staging and converting.

### 2. Profile & Report Page
- **Editorial Headline**: Plain-language verdict ("3 columns require attention before this data is safe to use").
- **Summary Strip**: Row count, column count, duplicate record count, profile scan time separated by hairline vertical dividers (no colored stat boxes).
- **AI Report**: Fully rendered markdown with typography styled to IBM Plex Sans, clear table formatting, and code blocks.
- **Column Inspector Table**:
  - Sticky table header.
  - "Issues only" toggle to isolate columns requiring cleaning.
  - Inline proportional bar for null percentages (formatted cleanly as `<0.01%` when below 0.01%).
  - Real status derivation: accurately flags nulls, negative outliers, whitespace tokens, and format ambiguities.
  - Expandable row details for sample values and token breakdowns.
- **Disclosure**: "Engine & Technical Details" collapsed at bottom for interested engineers.

### 3. Approval Page (Interactive Centerpiece)
- **Open Questions Banner**: Prominently displayed at top if timezone, day/month ambiguity, or deduplication keys require human confirmation. Primary action button is disabled with explicit text until answered.
- **Interactive Recipe List**:
  - Numbered cleaning rules rendered as one plain-English sentence.
  - Toggle switch to include/exclude specific rules.
  - Inline controls to customize rule parameters (e.g., date formats, null handling strategy, clipping bounds).
  - Explicit "Why this rule is proposed" note linking directly to the profiler finding.
- **"What Will Change" Projected Impact**: Derived strictly from actual profile data (e.g., `400 duplicate rows will be removed`, `642 empty values will be dropped`).
- **Safety Reassurance**: *"Your original CSV file is never altered. DuckDB creates a new cleaned version."*
- **Advanced Execution Settings**: Collapsible disclosure containing memory limits and thread controls.

### 4. Progress Page
- Multi-phase status progression: Ingestion → Profiling → AI Drafting → CTE Execution → Verification.
- Real progress indicators matching backend states (`UPLOADED`, `CLEANING`, `VERIFYING`, `DONE`).
- Accessible `aria-live="polite"` announcements for screen readers.
- Elapsed timer and clean indeterminate bar when exact sub-stage percentage is unmetered.

### 5. Results Page
- Reconciled Before/After Table: Clean delta indicators (`Rows In`, `Rows Out`, `Rows Dropped`, `Duplicates Pruned`).
- Test Verification Suite: Failed or warning tests placed first with prominent status tags and remediation details.
- Artifact Download Action Group: Primary "Download Clean CSV" button, secondary "Download Parquet", and audit report JSON download.
- "Clean Another File" reset action returning safely to step 1.

---

## 5. Backend Gaps & Architectural Constraints
1. **Cancellation API**:
   - The backend currently runs execution in FastAPI `BackgroundTasks` without an explicit abort/cancel endpoint (`POST /api/jobs/{id}/cancel`).
   - *UI Handling*: The UI will offer upload cancellation before transmission, but once cleaning starts, it surfaces progress indicators and status feedback.
2. **Per-Cell Visual Diff Stream**:
   - The backend produces dataset-level Before/After reconciliation and column-level null/negative counts, rather than a full cell-by-cell row diff.
   - *UI Handling*: UI strictly displays true Before/After metrics and deltas without fabricating row-level diff visualizations.
3. **Recipe Parameter Mutation**:
   - The backend supports passing custom recipe dictionaries into `POST /api/jobs/{id}/clean`.
   - *UI Handling*: The interactive approval screen serializes the edited recipe directly into this payload.
