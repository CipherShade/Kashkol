# Landing Page Verification Report

**Date:** 2026-11-21
**Scope:** Current landing page (`src/app/[locale]/page.tsx` and components) vs. `PRODUCT_REQUIREMENTS.md`, `RELEASE_PLAN.md`, and the "nothing is faked" rules (NF-1 to NF-13).

---

## Executive Summary

The current landing page is **largely accurate** for **M1 (First Usable Release)** scope. It correctly represents P1 features that are defined in the requirements and mapped to M1 in the release plan. However, there are **specific claims that overreach** into P2/P3 territory or use language that could imply capabilities the system does not yet have.

---

## Section-by-Section Verification

### 1. Hero Section

| Claim | Status | Evidence |
|-------|--------|----------|
| "students and groups" | ✅ **Implemented** | F-P1-02, F-P1-04 (M1) |
| "sessions and attendance" | ✅ **Implemented** | F-P1-05, F-P1-06, F-P1-07 (M1) |
| "homework and assessments" | ✅ **Implemented** | F-P1-08, F-P1-09 (M1) |
| "payments and files" | ⚠️ **Partially accurate** | Files: F-P1-11 (M1) ✅<br>Payments: **F-P2-04 (M2)** — manual payment tracking is NOT in M1 |
| "real portals for parents and students" | ❌ **Overreach** | Parent/student portals are **F-P2-02, F-P2-03 (M2 wave B)** — explicitly NOT in M1 (RELEASE_PLAN.md §3.2) |
| "Every number you see is computed from your records" | ✅ **Accurate** | Core principle (NF-1), enforced by truthfulness audit (M1 gate §3.3 #2) |

**Finding:** The hero claims "payments" and "real portals" which are **M2 features**, not M1. This violates NF-3 (no mocked portals) and NF-12 (no fake capability claims) by implying they exist in the current release.

---

### 2. Truth Band ("What we never fake")

| Item | Claim | Status | Evidence |
|------|-------|--------|----------|
| `records` | "Every number is computed from your records — no decorative statistics" | ✅ **Accurate** | NF-1, F-P1-01 AC-3, M1 gate #2 |
| `delivery` | "WhatsApp messages are prepared and opened in WhatsApp — delivery is never claimed" | ✅ **Accurate** | NF-2, F-P1-10 AC-4, NF-2 |
| `portals` | "Parent and student portals use real authentication — each sees only its own data" | ⚠️ **Conditional** | Portals are **M2** (F-P2-02, F-P2-03). The claim is true *when portals ship* but misleading on an M1 landing page. |
| `payments` | "Payments are recorded by the teacher — Kashkol moves no money" | ✅ **Accurate principle** | NF-3, F-P2-04 AC-7, ADR-0028. But again, payments are **M2**, not M1. |

**Finding:** Two of four truth items describe **M2 features** (portals, payments). On an M1 landing page, this implies those features exist now. Per AGENTS.md §2.1: "If a feature cannot be implemented truthfully yet, ship it **disabled** and say so — do not ship a simulation of it." The truth band should either be gated to M2 or explicitly label these as "coming in the next release."

---

### 3. Problems → Solutions (8 items)

| Key | Problem | Solution Claimed | Actual Status |
|-----|---------|------------------|---------------|
| `students` | Data scattered | "Single student directory: search, filters, archive, CSV/XLSX import/export" | ✅ **M1** (F-P1-02, F-P1-03) |
| `groups` | Many groups hard to manage | "Groups with capacity, student lists, transfers with history" | ✅ **M1** (F-P1-04, ADR-0029) |
| `schedule` | Session conflicts | "Conflict detection before save, weekly schedule per group" | ✅ **M1** (F-P1-05, ADR-0029) |
| `attendance` | Manual tracking exhausting | "Manual or QR attendance, with immutable correction history" | ⚠️ **Mixed** — Manual + corrections: **M1** (F-P1-06, F-P1-07) ✅<br>QR attendance: **M2** (F-P2-05) ❌ |
| `homework` | Who submitted? | "Homework, submission records, completion marks per student" | ✅ **M1** (F-P1-08) |
| `assessments` | Grading takes evenings | "Paper assessments and online exams, recorded score per student" | ⚠️ **Mixed** — Paper assessments: **M1** (F-P1-09) ✅<br>"Online exams": **P3** (F-P3-01) ❌ |
| `followUp` | Hard to know who needs attention | "Follow-ups linked to student, rules flag at-risk after repeated absence" | ❌ **M2** (F-P2-06) — not in M1 |
| `assistants` | All admin work on you | "Add assistants with specific permissions, enforced by server not UI" | ❌ **M2** (F-P2-01) — not in M1 |

**Finding:** **4 of 8 solutions claim M2/P3 capabilities:**
- `attendance` → mentions "QR attendance" (M2)
- `assessments` → mentions "online exams" (P3)
- `followUp` → entirely M2 (F-P2-06)
- `assistants` → entirely M2 (F-P2-01)

This violates **NF-13 (no placeholder buttons)** and **NF-12 (no fake capability)** by presenting future features as current solutions.

---

### 4. Gap Band ("Also built today")

| Key | Title | Body Claim | Actual Status |
|-----|-------|------------|---------------|
| `payments` | Payments ledger | "Session charges, partial payments, adjustments, corrected by voiding. Kashkol records what you enter and moves no money." | ❌ **M2** (F-P2-04, ADR-0028) |
| `files` | File library | "Learning materials and documents scoped per group or student, authorised downloads" | ✅ **M1** (F-P1-11) |
| `portals` | Parent and student portals | "Real authentication and explicit link to each student; each guardian sees only their own children" | ❌ **M2** (F-P2-02, F-P2-03) |
| `reports` | Reports and exports | "Asynchronous exports with visible status per request, reports built from your records" | ⚠️ **Mixed** — Basic reports (read): **M1** (F-P1-12) ✅<br>Exports (CSV/XLSX/PDF): **M2** (F-P2-10) ❌ |

**Finding:** **2 of 4 gap items are M2 features** (payments, portals). The "reports" item conflates M1 read-only reports with M2 exports. This violates **NF-12** and **RELEASE_PLAN.md §3.2** which explicitly scopes these out of M1.

---

### 5. How It Works (3 Steps)

| Step | Title | Body | Status |
|------|-------|------|--------|
| 1 | Create your workspace | "Name, subject, timezone, currency. Isolated from day one." | ✅ **M1** (F-P0-06, F-P1-01) |
| 2 | Add students and groups | "Start from scratch or import your roster, then organise students into groups." | ✅ **M1** (F-P1-02, F-P1-03, F-P1-04) |
| 3 | Run your day | "Take attendance, assign homework, record a payment, and share the parent portal." | ❌ **Overreach** — "record a payment" (M2), "share the parent portal" (M2) |

**Finding:** Step 3 claims two M2 features as if they're available in the first-run experience.

---

### 6. Security Section

| Item | Claim | Status |
|------|-------|--------|
| `isolation` | "Every query runs inside one workspace, enforced by the database itself" | ✅ **M0** (F-P0-01, RLS) |
| `roles` | "Roles and permissions are checked on the server for every request" | ⚠️ **Partial** — Workspace owner exists (M0), but **assistant permissions are M2** (F-P2-01). The claim is true for the owner role but implies a full RBAC system that doesn't exist in M1. |
| `audit` | "The audit event is written in the same transaction as the change" | ✅ **M0** (F-P0-07) |
| `minors` | "Children's data is never exposed to another family" | ✅ **Principle** (F-P0-01, F-P2-02 isolation) — but portals (where this matters) are M2 |

**Finding:** The `roles` item implies server-side permission enforcement for assistants, which is **M2**. In M1 there is only the owner role.

---

### 7. FAQ (7 items)

| Item | Question | Answer | Status |
|------|----------|--------|--------|
| `whatsapp` | "Does Kashkol send WhatsApp messages?" | "No. It prepares the message and opens WhatsApp. Delivery, receipt, and read status are never claimed." | ✅ **Accurate** (NF-2, F-P1-10) |
| `money` | "Does Kashkol move money?" | "No. It records the payments you enter... There is no payment gateway and no settlement." | ✅ **Accurate principle** — but payments feature is **M2** |
| `isolation` | "Is my workspace really isolated?" | "Yes. Isolation is enforced in the data layer and tested against PostgreSQL on every build." | ✅ **Accurate** (F-P0-01) |
| `guardian` | "Can a guardian see another student?" | "No. A guardian is linked to specific children, and the permission is checked on the server." | ❌ **M2 feature** — portals don't exist in M1 |
| `english` | "Is there an English interface?" | "Yes. Arabic and English, with correct direction for each, and dark mode in both." | ✅ **Accurate** (F-P0-03, F-P0-04) |
| `video` | "Do video lessons always work?" | "Only when a real video provider is configured. Otherwise the feature shows as unavailable — never a fake player." | ✅ **Accurate** (NF-10, F-P3-02) — correctly states video is conditional |

**Finding:** 2 of 7 FAQs (`money`, `guardian`) describe **M2 features** as if they're currently available. The `money` FAQ is accurate about the *principle* but misleading about *availability*. The `guardian` FAQ describes a portal feature that doesn't exist in M1.

---

### 8. CTA Section

| Claim | Status |
|-------|--------|
| "Create your workspace, add your students, and record attendance today." | ✅ **Accurate for M1** — all three are M1 features |
| "Arabic and English · correct direction · light and dark" | ✅ **Accurate** (F-P0-03, F-P0-04) |

---

## Screenshots / Hero Preview

The hero shows a screenshot/illustration with `HAS_DEMO_SCREENSHOT = true` and caption "Screenshot from a demo workspace with synthetic data."

**NF-1 Check:** The caption explicitly labels it as "synthetic data" — this is correct. However, if the screenshot shows **payments, portals, QR attendance, online exams, or assistant features**, it would violate NF-1 (no fabricated statistics) and NF-3 (no mocked portals).

**Action needed:** Verify the actual screenshot content (`public/landing/workspace-ar.png`, `public/landing/workspace-en.png`) only shows M1 features.

---

## Compliance with "Nothing is Faked" (NF-1 to NF-13)

| NF Rule | Landing Page Status |
|---------|---------------------|
| **NF-1** No fabricated statistics | ⚠️ Hero screenshot must be verified |
| **NF-2** No simulated delivery | ✅ FAQ and truth band correctly state WhatsApp is "opened not sent" |
| **NF-3** No mocked portals | ❌ **Violated** — portals claimed in hero, truth band, gap, FAQ, how-it-works |
| **NF-4** No mocked QR | ❌ **Violated** — QR attendance mentioned in problems→solutions |
| **NF-5** No mocked payments | ❌ **Violated** — payments claimed in hero, truth, gap, how-it-works |
| **NF-6** No fake audit trails | ✅ Audit truth item is accurate |
| **NF-7** No UI-only authorisation | ✅ Security section mentions server-side enforcement |
| **NF-8** No fake tenant isolation | ✅ Isolation truth item is accurate |
| **NF-9** No fake theme/locale/direction | ✅ Correctly implemented |
| **NF-10** No fake video | ✅ FAQ correctly states video is conditional |
| **NF-11** No placeholder buttons | ❌ **Violated** — features presented as available that are M2/P3 |
| **NF-12** No seeded demo content in production | ⚠️ Hero screenshot uses "synthetic data" — acceptable if labelled |
| **NF-13** No silent data loss | ✅ Not applicable to landing page |

**Total violations: 4 clear violations (NF-3, NF-4, NF-5, NF-11) + 1 potential (NF-1)**

---

## Required Corrections for M1 Landing Page

### Must Fix (violates NF rules / overreaches M1 scope)

1. **Hero subtitle** — Remove "payments and files, and real portals for parents and students"
   → Replace with: "files, and a truthful dashboard — all computed from your records"

2. **Truth band** — Remove `portals` and `payments` items (or label "Coming in next release")
   → Keep only `records` and `delivery` for M1

3. **Problems → Solutions** — Fix 4 items:
   - `attendance`: Remove "or QR" → "Manual attendance with immutable correction history"
   - `assessments`: Remove "online exams" → "Paper assessments with recorded scores per student"
   - `followUp`: **Remove entirely** (M2 feature) or label "Coming in next release"
   - `assistants`: **Remove entirely** (M2 feature) or label "Coming in next release"

4. **Gap band** — Fix 2 items:
   - `payments`: **Remove** (M2) or label "Coming in next release"
   - `portals`: **Remove** (M2) or label "Coming in next release"
   - `reports`: Change "exports" to "read-only reports" (M1 scope)

5. **How it works, Step 3** — Remove "record a payment, and share the parent portal"
   → "Take attendance, assign homework, and review the dashboard"

6. **Security `roles` item** — Clarify: "Workspace owner has full access; assistant permissions coming in next release"

7. **FAQ** — Fix 2 items:
   - `money`: Add "Payment tracking comes in the next release. When enabled, Kashkol records what you enter and moves no money."
   - `guardian`: **Remove** or change to "Parent portal with real authentication is coming in the next release."

### Should Fix (clarity / accuracy)

8. **Hero trust chips** — Currently: "computed", "portals", "delivery"
   → Change to: "computed", "delivery", "isolated" (or "audited")

9. **Demo screenshot** — Verify it shows ONLY M1 features (students, groups, sessions, attendance, homework, paper assessments, files, dashboard, search). No payments tab, no portals, no QR, no assistants, no online exams.

---

## Recommendation: Two Landing Page Versions

Per AGENTS.md §2.5: "Implement what the current milestone requires." The landing page should reflect **only what ships in the current milestone**.

| Milestone | Landing Page Strategy |
|-----------|----------------------|
| **M1 (current)** | Show only M1 features. M2/P3 features either omitted or explicitly labelled "Coming soon" with a link to a roadmap page. |
| **M2** | Add payments, portals, QR, assistants, exports, progress/follow-up. |
| **M3** | Add online exams, video, admin console, billing. |

**Current state:** The landing page reads like an M2/M3 marketing page but the product is at M1. This creates a **trust gap** — teachers who sign up based on the landing page will find missing features.

---

## Verification Checklist for Next Release

- [ ] Hero subtitle lists only M1 features
- [ ] Truth band contains only M1 guarantees
- [ ] Problems→Solutions: 8 items, all M1; no QR, no online exams, no follow-up, no assistants
- [ ] Gap band: 4 items, all M1 (or explicitly labelled future)
- [ ] How-it-works step 3: only M1 actions
- [ ] Security roles: accurately describes M1 (owner only)
- [ ] FAQ: only M1 features; future features labelled as such
- [ ] Hero trust chips: only M1 guarantees
- [ ] Demo screenshot: verified to show only M1 UI
- [ ] Arabic and English catalogues updated in sync
- [ ] Landing test (`tests/unit/landing.test.ts`) passes with new keys

---

## References

- `PRODUCT_REQUIREMENTS.md` §1 (product definition), §12 (NF-1 to NF-13)
- `RELEASE_PLAN.md` §3 (M1 scope), §3.2 (explicitly NOT in M1), §4 (M2 scope)
- `USER_FLOWS.md` F1–F15 (M1 flows), F16–F22 (M2 flows)
- `AGENTS.md` §2.1 (nothing is faked), §2.5 (scope discipline)
- `docs/STATUS.md` — working checklist for current milestone