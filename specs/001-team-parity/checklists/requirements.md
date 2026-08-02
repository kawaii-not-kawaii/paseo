# Specification Quality Checklist: Team Parity

**Purpose**: Validate specification completeness and quality before proceeding to tasks
**Created**: 2026-07-27 · **Last revalidated**: 2026-07-27 (post-analyze)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — all resolved 2026-07-27
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified
- [x] No requirement ID collisions — 71 FR, 23 SC, all unique

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Every success criterion has a validation step in [quickstart.md](../quickstart.md)
- [x] No implementation details leak into specification

## App-Side Grounding

- [x] Team scope reconciled with the app's cross-daemon project model — per project per daemon
      (FR-001a, FR-001b), verified against `ProjectSummary.hosts` in `packages/app/src/utils/projects.ts`
- [x] Route ownership constraint recorded — Team is a host-level leaf under `h/[serverId]`, per
      `docs/expo-router.md`. Misplacement fails silently on native.
- [x] Panel/layout integration resolved — research R8: Team is a route, not a fourth mobile panel.
      `docs/mobile-panels.md` forbids adding another panel translate shared value.

## Autonomy and Guards

- [x] Bounded by progress, not turn count — productive review loops explicitly protected (SC-015)
- [x] Three guards cover distinct failure modes: handbacks (non-converging loop), per-attempt
      wall-clock (member wedged inside one attempt), no-progress backstop (talk without work)
- [x] Escalation reaches the user through the notification path, not only view state (FR-035e1)
- [x] No member capability requires holding a session open — FR-032 states delivery, not waiting,
      consistent with research R5 and the 2-minute idle runtime reaper

## Members

- [x] Role prompt is exclusive per member, seeded by template or proposal, editable after (FR-014a/b)
- [x] Member home directory is distinct from home workspace, with different lifetimes (FR-014d, R9)
- [x] Proposals never auto-create members — user confirms each (FR-014c, R10)
- [x] Home workspaces exempt from auto-archive on merge (FR-019a, R11)
- [x] Memory survives workspace archival, worktree removal, and re-pointing (FR-019b, SC-011b)

## Constitution Alignment (v1.1.x)

- [x] Single-user scope — no auth, roles, permissions, invites, or marketplace in any requirement
- [x] Backward compatibility — FR-036 adoption, FR-043 capability gate
- [x] No fallback paths — FR-043 is update-the-host, not a degraded Team view
- [x] Cross-platform by default — FR-003, SC-010 require phone-width parity
- [x] Terminology collisions flagged — Task vs Agent session, Member vs Agent session, Claim vs
      assignee, Member home directory vs Home workspace (Key Entities)
- [x] SQLite bounded to the team surface; migration runner at v1; Zod at the read boundary
- [x] Fork mergeability — all logic in fork-owned directories; 9 seams enumerated in `docs/fork.md`

## Notes

- Design decisions and their rationale live in [research.md](../research.md) R1–R11. R9–R11 were
  added post-analyze to cover the late member-related decisions.
- Defaults chosen: handbacks 3, per-attempt wall-clock 30 min (also the claim lease TTL),
  no-progress backstop 12. All per-project configurable; rationale in R2–R4.
- Claims are lease-based, decoupled from runtime liveness. This is the single most important
  invariant in the feature — quickstart step 3 is its regression test.

## Open, tracked outside this checklist

- Constitution Principle VII enumerates "read state" as in-scope for SQLite, but no requirement
  defines unread tracking and the Assumptions exclude an activity inbox. Resolved by constitution
  amendment 1.1.1 (removing "read state") rather than by adding unbuilt scope here.
