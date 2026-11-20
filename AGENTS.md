<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Planner architecture
- PlannerProvider (src/components/planner/state.tsx) owns all user data and persists every collection through src/lib/daywell/storage.ts, namespaced by the local profile id. Keep storage access in that module so it can be swapped for an API; collections mirror db/schema.sql.
- Every user-owned record carries `userId`. Never hardcode a user's name — read it from the profile.
- Time-based state (task status, class timer, reminders) is derived from timestamps in src/lib/daywell/*, never from accumulated intervals.
- Use separate TanStack content routes for planner modules and semantic theme tokens in src/styles.css, so navigation and both appearances remain consistent.
