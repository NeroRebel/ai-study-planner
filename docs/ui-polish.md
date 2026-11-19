# UI polish

## Direction and scope

The existing planner remains the product: warm off-white canvas, white surfaces, muted beige primary actions, restrained lavender/blue subject accents, and readable charcoal text. This pass refines hierarchy, alignment, feedback and responsiveness without changing API contracts, authentication, scheduler ordering, risk thresholds, replanning or AI tool execution.

The existing system font stack is retained. Page titles are 24–28px, section headings 14–16px, body text 13–14px and metadata generally 11–12px. Small-screen form controls use 16px text to avoid mobile input zoom.

## Tokens and shared styles

`frontend/src/styles/tokens.css` owns semantic colors for canvas, surfaces, text, borders, accent/hover, success, warning, destructive actions and risk levels. It also defines subject tones, subtle elevation, spacing (4/8/12/16/20/24/32/40/48px), base radii (refined to 4/6/8/10/12px in themes.css), focus color and shell dimensions. Existing styles consume these tokens; `polish.css` consolidates cross-surface interaction and responsive refinements.

Buttons share primary, secondary, ghost/subtle, destructive and icon treatments. Forms share control heights, borders, focus treatment and label spacing. Risk remains readable text as well as color. A small internal `Feedback` component provides status/alert semantics; existing planner feedback and request errors reuse it. `LoadingState` announces progress while decorative skeletons remain hidden from assistive technology. Feedback stays near the relevant action instead of introducing a global toast dependency.

## Motion

Motion is the only added animation library. Imports use `motion/react`. The root `MotionProvider` defaults to `reducedMotion="user"`, with a local Reduced/Full override and a short default transition.

- Route content uses a 200ms opacity entrance. Departing routes are not retained, avoiding stale account content during navigation or sign-out.
- Auth cards, messages and confirmation cards use small 4–8px entrances around 180–240ms.
- Native dialogs animate their backdrop and inner panel with opacity, a 10px offset and 0.985 scale. Escape, native focus containment and focus restoration remain intact. Closing is disabled during replanning Apply. Parent-driven dismissal, including form submission, may unmount immediately.
- Subject cards and quick prompts have tiny enabled-only press interactions.
- Calendar blocks use position layout transitions and opacity entrances; no scheduling decisions are made by animation.
- Progress bars transition briefly. No long list staggering, decorative background motion or artificial thinking sequence is used.

Motion follows the OS reduced-motion preference. CSS also disables transitions, pulsing indicators and smooth scrolling under `prefers-reduced-motion: reduce`. Controls remain usable without animation.

## Surface changes

- **Shell:** consistent sidebar sizing and active marker, direct Assistant entry, linked profile avatar, calmer topbar, aligned content padding and mobile More navigation.
- **Dashboard:** compact typography, real Assistant navigation in place of a disabled search field, readable empty-risk wording, balanced cards and compact phone deadline rows.
- **Tasks/Subjects:** shared form/table treatment, clearer status and risk colors, consistent progress rows, restrained subject-card interaction and refined details dialogs.
- **Calendar:** clearer controls, availability shading, current-day accent, ellipsis for long session names with full accessible descriptions, and consistent generation feedback. The existing scrollable time grid is preserved.
- **Replanning:** distinct valid/no-op, changed and partial states, four diff counts, visible unscheduled work and existing risk transitions. Apply eligibility and stale-preview handling are unchanged.
- **Deadlines/Risk:** consistent semantic badges and deterministic explanations; deadline details include explicit Budapest time.
- **Progress:** all displayed reporting comes from saved entities. The synthetic historical completion trend and its unused fixture file were removed in favor of current task effort progress. Zero planned time does not draw a full comparison bar; weekly chart scale accommodates both planned and reported hours.
- **Assistant:** integrated greeting and quick prompts, readable message bubbles, multiline composer, Enter to send/Shift+Enter for a newline, IME-safe submission, genuine pending/error/retry feedback, approval/saved labels and structured confirmation/replan/risk cards. Auto-scroll follows new output only when the reader is already near the bottom or explicitly sends a message. No tool progress is invented.
- **Auth/Profile:** restrained panel entrance, consistent fields and action hierarchy, avatar replacement feedback, keyboard-visible upload focus and a separate destructive account section. OAuth and account operations are unchanged.

## Responsive behavior

Desktop uses a 216px sidebar (184px at compact laptop/tablet widths). The Dashboard assistant side panel appears from 1440px; the full Assistant route remains available at all sizes. Smaller layouts stack planning sections and use two-column compact KPI grids. Phone navigation stays at the bottom, additional routes use More, tables retain existing contained scrolling/card alternatives, and the calendar scrolls within its own region rather than widening the page. Dialog panels fit within dynamic viewport height and scroll internally.

## Accessibility

Native buttons, labelled dialogs, Escape dismissal, focus restoration, skip navigation and route focus are preserved. Form labels now explicitly target controls, keeping select option text out of accessible names; help text is separately associated with `aria-describedby`. Status and error regions use appropriate live-region roles. Common controls have 40–44px targets, visible keyboard focus, disabled states and text-based risk labels. Full calendar block information remains available through accessible labels and details.

## First-pass verification

Browser review used Chromium with actual application components and an isolated in-memory HTTP/auth harness. It did not write to Supabase or call Gemini. All eight main routes and five auth surfaces were checked at 1440, 1024, 768 and 390px: 52 combinations, no page-wide horizontal overflow or browser exceptions. Screenshots were reviewed for layout and hierarchy. Calendar/table regions intentionally scroll horizontally where necessary.

Thirteen browser interaction groups exercised native dialog focus/Escape/restoration, task creation/progress, subject details, generation feedback, no-op and partial replanning Apply/Cancel, manual study blocks, Assistant quick actions/confirmation/cancellation/retry, phone navigation and reduced-motion dialogs. These checks validate presentation against mocked HTTP; they do not replace live provider acceptance testing.

Automated frontend tests cover motion policy, dialog semantics, busy close protection, loading/feedback accessibility, composer labels, honest Progress rendering and explicit form-label associations, alongside the existing auth, ownership, scheduler, risk, replanning and Assistant regression suites. Tests do not depend on animation timing.

Final checks: frontend tests **98 passed** (the original 89 plus nine polish checks), frontend lint/build passed, backend regression tests **253 passed**, `alembic check` reported no new upgrade operations, and `git diff --check` passed. Backend source and migrations were not changed. Temporary browser harness entry files were removed after review; no test records were created in the live database.

## Limitations

- Appearance and local UI preferences are implemented in the focused refinement described below; deterministic planner policy is not user-configurable.
- Small-screen weekly calendars retain contained horizontal scrolling. Very short blocks use compact text; details expose the full content.
- There is no new historical analytics backend, drag-and-drop, streaming tool-status protocol or new notification system.
- This pass did not repeat live Google OAuth, Gemini paid calls, account deletion or two-user Supabase writes. Existing service behavior is covered by regression tests; browser checks here use fixtures.
- Browser checks and accessibility improvements are not a complete WCAG certification or an exhaustive physical-device/screen-reader audit.

## Focused refinement: themes, controls and configuration

This follow-up keeps the same product and services, with a stricter Segoe UI/system sans-serif hierarchy, smaller 4–12px radii, flatter cards, numbered Settings sections and clearer dividers. No font download or additional dependency was introduced. The warm neutral default remains; persistent actions use a deliberate solid accent rather than repeating pastel containers.

### Theme and accent system

`styles/themes.css` extends the semantic base tokens. A root `data-theme` resolves to Light or Dark; System follows `prefers-color-scheme` and responds to OS changes while the app is open. Configuration is read before React paints, including auth pages. Dark mode covers surfaces, fields, dialogs, charts, subjects, status feedback and Assistant content. Custom subject colors retain their stored hue and use theme-aware text.

`data-accent` selects Amber/Gold, Red, Blue, Green, Violet or Teal. Hue/saturation tokens derive readable accent text, solid buttons, selected controls, navigation, borders and focus treatments for each theme. Risk LOW/MEDIUM/HIGH, warning and success use separate semantic tokens and do not change when accent changes.

Normal/High contrast applies independently to both themes. High contrast strengthens text and dividers and adds risk outlines. This is an application preference, not a claim of full WCAG certification or an OS forced-colors implementation.

### Custom controls

`components/common/Controls.tsx` supplies a Motion Button with loading state, CheckControl, labelled Toggle and native-radio SegmentedControl with a shared Motion selection indicator. `styles/controls.css` applies the same language to existing controls without rewriting their API handlers:

- Primary, secondary, subtle, ghost, destructive, icon and compact button treatments; disabled/loading states, focus rings and small press feedback.
- Checkboxes, radios and switches use `appearance: none` with explicit checkmarks, thumb/dot states and brief transitions. They retain native label association, Space/arrow-key behavior, form semantics and disabled behavior.
- Selects use a custom chevron. Inputs, search, date/time fields and textareas share borders, spacing and theme colors. Disclosure controls use a styled chevron and retain native details/summary keyboard behavior.
- Native select option menus and date/time picker popovers are intentionally retained for platform keyboard/mobile accessibility; the closed controls are custom styled. This pass does not add a custom date-picker dependency.

Motion offers System/Reduced/Full. System honors OS changes, Reduced suppresses transforms and CSS motion, and Full is an explicit user override. Small opacity fades may remain under Motion's reduced policy. Dialog close transitions become immediate in Reduced mode. Sidebar width, controls and calendar changes also honor the resolved setting.

### Profile and Settings

`/profile` contains identity only: avatar, display name, Auth email and the fixed Budapest timezone, using the existing account-persisted profile/Storage APIs. Sidebar/topbar profile controls and mobile More link here. It contains no sign-out, deletion, appearance or planner controls.

`/settings` has Appearance, Planner, Assistant, Accessibility and Account & Security sections with keyboard-accessible section links. Changes apply immediately and save locally. Account Security reuses existing auth operations for sign-out, password recovery and typed DELETE confirmation, with destructive actions separated at the bottom.

Only functional preferences are shown. New manual-block duration changes the initial end time in Add study block (existing blocks are untouched). Automatic scheduler splitting/deadline rules remain documented, read-only policy; the old inactive planning toggles are removed from the UI. Availability remains the supported way to constrain study times. Assistant preferences expand existing risk/replan disclosures and keep quick prompts visible; they do not alter prompts, tool arguments, model verbosity, risk or confirmation policy. Confirmation is always required and cannot be disabled.

### Side panels and breadcrumbs

The desktop sidebar switches between full and 72px icon-only modes. It preserves active indicators, accessible link names and focus/hover labels; width transitions are short and disabled under reduced motion. Mobile navigation remains independent of the desktop collapse state.

The Dashboard Assistant panel can be hidden/reopened at large desktop widths. Its shared account-bound conversation store remains mounted, so collapsing does not discard messages or pending confirmations. The full Assistant route is always available. A local composer draft is not retained if its panel is unmounted; conversation state is unaffected.

Breadcrumb parents use React Router links, with only the current segment marked current. Task/session editors add a meaningful current detail segment. Subject details remain dialogs rather than introducing artificial URL routes.

### Calendar density and containment

Calendar density is persisted as Compact, Comfortable or Wide. Minimum day-column widths are respectively 128/164/212px; aligned hour heights are 52/68/84px. Grid and time labels share the same hour-height variable. The weekly grid scrolls inside its container when it cannot fit; it never compresses columns below the chosen minimum. Phone Calendar also keeps this scrollable seven-day grid, while the Dashboard phone snapshot retains its single-day agenda.

Session blocks remain inside their day, with true duration height, no minimum-height inflation, ellipsis and full accessible title/details. Task title leads, followed by subject/time/status as space permits. Short blocks hide secondary metadata. Adjacent blocks retain a small visual gap. The compact desktop Dashboard snapshot has its own minimum column width and contained scrolling. Density changes presentation only, not session times or scheduler behavior; draggable separators are not implemented.

### Preference persistence and privacy

`state/uiPreferences.ts` owns a small external React store under localStorage key `ai-study-planner.ui.v1`. It validates an allowlist on load, tolerates invalid/denied storage, supports cross-tab updates and notifies mounted controls. Saving failure leaves preferences usable for the current tab and displays a truthful notice.

Device-local preferences: theme, contrast, accent, motion, interface spacing, sidebar collapse, Assistant panel visibility, calendar density, new manual block duration and Assistant disclosure/quick-prompt choices. They persist across reloads and accounts on the same browser, contain no identity, planner records, tokens or conversation text, and do not sync between devices. Profile identity/avatar remain account-persisted; workspace/conversation clearing on sign-out/account switch is unchanged. No preference changes a deterministic backend policy.

### Follow-up verification

Browser review uses actual app components with isolated auth/HTTP fixtures, with no real Supabase writes or paid AI requests. It covers nine main routes at 1440/1280/1024/768/390px in light, dark and both high-contrast variants, plus auth pages in light/dark. Interaction checks exercise reload persistence, OS theme changes, keyboard switches/radios/task checkboxes, app motion overrides, sidebar labels/width, Profile/Settings navigation and deletion gating, breadcrumbs, Assistant collapse/confirmation, calendar density/bounds, manual duration defaults, native dialog focus and generation/replanning Apply/Cancel. Unit coverage includes preference validation/failure recovery and semantic control rendering. The original profile test now checks destructive behavior on its new Account Security surface rather than its former Profile location.


Follow-up results: **111 frontend tests passed**, **253 backend tests passed**; lint, production build, `alembic check` and `git diff --check` passed. The browser matrix completed **200 combinations** with no page-wide horizontal overflow or uncaught rendering errors. **Fourteen interaction groups passed**, including actual keyboard selection/completion and reload persistence. The temporary frontend browser harness was removed after checks. Browser QA used isolated fixtures; no live account deletion, OAuth redirect, paid Gemini request or Supabase planner write was performed during this pass.

## Structural shell refinement

The third pass makes the shell more coherent while preserving all backend contracts and planner/auth/AI behavior. Inspiration comes from restrained desktop productivity interfaces and the project references; the open-page brand mark and composition are project-specific.

- **Sidebar:** 224px expanded, 200px on compact tablets/laptops, and a 64px rail. The product name and collapse icon share a single identity row. In the rail, one logo button becomes an open-sidebar icon on hover/focus and reopens navigation. There is no second standalone toggle. Motion animates width and label opacity; reduced-motion users get immediate width changes. Focus transfers to the new counterpart after toggling. Labels/tooltips and active indicators remain available.
- **Settings alignment:** a dedicated utility group has its own divider and 12px clearance. Settings uses the same 24px icon box, 19px stroke-1.7 icon and row padding as the other navigation items. Selection belongs to the row rather than the divider.
- **Profile/topbar:** the sidebar bottom is the sole desktop avatar/profile entry. The topbar contains breadcrumbs, a quiet Personal workspace label and the Assistant route link. Mobile Profile stays under More; Profile and Settings remain separate.
- **Normal vs High contrast:** semantic values are consolidated in `styles/themes.css`. Normal uses a warm neutral light canvas and layered graphite dark surfaces with quieter outlines, muted secondary text and small accent tints. Navigation, Assistant, panels and elevated dialogs have distinct surface tokens. High Contrast retains strong text/dividers and status boundaries. Accent never changes semantic risk/success/warning meaning.
- **Typography/composition:** the existing local system sans-serif remains; page titles use a restrained 25px/600 hierarchy, numbers use aligned 28px tabular figures, and secondary labels stay compact. A small open-page BrandMark replaces generic graduation-cap branding across shell/auth. No font download or new dependency is required.
- **Dashboard:** four metrics form a flat divided summary rather than four outlined cards. The weekly plan receives the main width; Study load and Subject progress form a lighter two-column insight row. At sufficiently wide content widths a container query restores the side-by-side planner/insights arrangement. Priorities/deadlines use section dividers instead of repeated containers. Sparse data shows useful next steps rather than a large repeated empty week or synthetic chart. No data, ranking or calculations were changed. The weekly snapshot also omits irrelevant disabled navigation arrows and duplicate session titles.
- **Assistant:** a quiet 316px tonal dock integrates with the shell at 1440px and up. Its own header contains the single close action; the Dashboard offers Show only when closed. Motion changes dock width/content opacity; hidden content is inert. Tablet/phone use an explicitly opened native-dialog overlay with focus containment and Escape, keeping the workspace unsqueezed. Layout changes dismiss the temporary overlay. The existing account-bound conversation store survives hide/reopen; confirmations and tools are unchanged. Full-page Assistant remains available everywhere. Quick prompts are quieter text rows in the dock, and the composer uses an elevated surface.
- **Responsive:** no permanent sidebar below 768px. Bottom navigation/More remain, Dashboard metrics use two columns, sections stack, and the Assistant overlay fits the viewport. Existing calendar density/scroll behavior remains intact. Profile/Settings inherit the same updated shell and theme tokens.

The rail, dock, overlays, parent breadcrumbs and controls retain keyboard labels/focus. Motion is restrained and follows the existing System/Reduced/Full preference. High Contrast remains an explicit stronger accessibility option; this pass is not an exhaustive screen-reader/device certification.

Browser review used isolated auth/HTTP fixtures and actual components, without Supabase writes or Gemini calls. A matrix of 204 route/theme/viewport/sidebar combinations found no page-wide overflow, uncaught rendering exceptions, Settings-icon misalignment or duplicate topbar profile control. Representative rendered screens were inspected, plus eight populated/empty Dashboard cases. Interaction checks covered the rail logo, keyboard reopening, persistence/tooltips, profile entry, Settings spacing, measured contrast differences, dock confirmation retention/focus, tablet/phone overlays, responsive breakpoint changes, reduced motion and scheduler/replanning flows. Native option/date picker popovers, device-local preferences, contained narrow-calendar scrolling and non-persistent composer drafts remain the documented UI limitations.

Structural-pass validation: **121 frontend tests passed**, including all previous 111 tests and ten new shell/empty-state tests; **253 backend tests passed**. Frontend lint, production build and `git diff --check` passed. Ten browser interaction groups passed. The 204-case shell matrix plus eight populated/empty Dashboard cases used isolated fixtures and made no live provider/database changes. Backend source and migrations were not modified. Temporary frontend harness files were removed after review.

## Final palette and readability tuning

This final pass changes CSS values only; layout, navigation, component structure and Motion settings remain unchanged.

| Token | Light | Dark |
| --- | --- | --- |
| Page | `#F5F3EE` | `#1A1A1A` |
| Sidebar | `#F0EEE8` | `#191919` |
| Card | `#FAF9F6` | `#212121` |
| Elevated | `#FCFBF8` | `#242424` |
| Border | `#E4E0D8` | `#303030` |
| Primary text | `#1F1F1F` | `#F2F2F2` |
| Secondary text | `#6F6B65` | `#A8A8A8` |

The dark secondary surface is `#1E1E1E`; the light Assistant surface is `#F2F0EA`. High Contrast keeps its stronger text/border overrides. Light tertiary metadata uses the same accessible gray as secondary text, with size/weight preserving hierarchy rather than reducing contrast.

Body text increases from 14 to 15px, navigation from 13 to 14px, and existing 10–15px labels/body styles gain 1px. Section headings generally become 16px, dashboard metric labels 12px and small metadata 11–13px. Assistant messages/composer use 15px desktop text, retaining 16px mobile input text. Large headings, metric numbers, spacing, sidebar widths and motion are unchanged.

Short calendar blocks omit the secondary time line where it would clip; the full time remains in the accessible label, tooltip and details. Very compact Dashboard blocks retain a 12px single-line title to fit true duration height. Existing ellipsis, minimum day widths and contained scrolling remain in place. No backend behavior, data models or application logic changed.

Final tuning validation: **121 frontend tests** and **253 backend tests passed**; lint, production build and `git diff --check` passed. Browser review covered the seven requested routes in Light/Dark, five viewport widths and both sidebar states, plus High Contrast samples: **148 checks**, with no page-wide overflow, clipped navigation labels, calendar block spill or uncaught rendering errors. Ten existing interaction groups also passed against isolated fixtures. No live Supabase writes or Gemini calls were made. Temporary frontend review entries were removed; changes remain uncommitted.
