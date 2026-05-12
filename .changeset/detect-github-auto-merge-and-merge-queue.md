---
"@aoagents/ao-core": minor
"@aoagents/ao-plugin-scm-github": minor
"@aoagents/ao-web": minor
---

feat: detect GitHub auto-merge and merge-queue state

Previously, when a PR had auto-merge armed or was sitting in a merge queue, AO would still classify it as `mergeable` once approvals and checks were green and fire the "PR is ready to merge" notification — even though GitHub was about to merge the PR autonomously. The dashboard would light up the green "click merge" frame for PRs the user had already delegated to GitHub.

Three new `pr.reason` values capture GitHub's automated paths so the human is no longer paged when GitHub will do the work:

- `auto_merge_armed` — auto-merge enabled on the PR. Suppressed footer label "auto-merge armed", `pending` attention level. New silent event `merge.auto_armed`.
- `in_merge_queue` — PR is sitting in a merge queue. Footer "in merge queue", `pending` attention level. New silent event `merge.queued`. Takes precedence over `ci_failing` since the queue runs its own check suites on a merge-group ref.
- `merge_queue_rejected` — PR was in the queue and was dequeued without merging. `respond` attention level (page the human). New `merge.queue_rejected` event at warning priority.

The legacy `mergeable` status now only fires `merge.ready` (and the `approved-and-green` reaction) when the canonical reason is genuinely `merge_ready` — i.e. when neither auto-merge nor merge queue is involved.

- `scm-github` GraphQL batch query now fetches `autoMergeRequest` and `mergeQueueEntry` and threads them through `PREnrichmentData` along with raw `mergeStateStatus`.
- `scm-github` webhook parser handles `merge_group` events (used for merge-queue lifecycle).
- Dashboard `SessionCard` no longer applies the green "ready to merge" frame for PRs that GitHub is going to merge automatically.
- Cross-platform: pure GraphQL changes, no shell or platform-specific logic touched.

This also resolves a long-standing duplicate `PREnrichmentData` / `BatchObserver` interface declaration in `packages/core/src/types.ts`.
