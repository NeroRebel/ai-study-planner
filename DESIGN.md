# AI Study Planner — Visual and UX Direction

Status: initial design guidance for the MVP. Use [PROJECT.md](PROJECT.md) for scope and [SPEC.md](SPEC.md) for behavior, metrics, and backend responsibilities. This document guides the first frontend phase with mock data; it does not require backend integration yet.

## 1. Design principles

Use a modern, minimal SaaS dashboard style with a calm academic tone. Students should be able to identify today's work, the next deadline, and any capacity problem quickly.

- Use a clean layout, generous whitespace, rounded cards, subtle borders, soft shadows, and neutral backgrounds.
- Establish hierarchy through typography, spacing, and grouping before adding color or decoration.
- Give primary actions clear labels such as “Generate weekly plan” or “Update progress”.
- Keep secondary details available without letting every statistic compete for attention.
- Keep risk, status, and planned versus actual time visually distinct.
- Prefer readable lists and restrained charts to decorative widgets and dense visual noise.
- Explain infeasibility with concrete information: remaining work, usable time, shortfall, and available next actions.

## 2. Visual direction

### Palette

These are starting design tokens, subject to contrast checks during UI implementation. Light accent colors are intended for surfaces; pair them with sufficiently dark text.

| Role | Starting value | Usage |
| --- | --- | --- |
| Page background | #F7F6F2 | Warm white/light gray canvas. |
| Card surface | #FFFFFF | Cards, forms, assistant panel. |
| Primary text | #27272A | Charcoal headings and body. |
| Secondary text | #62626B | Supporting labels and metadata. |
| Border | #E5E3DD | Quiet divisions and control outlines. |
| Beige/gold | #EFE5CF / #71551D | Primary accents, selected states, and highlights. |
| Soft purple | #EEEAF8 / #625083 | Thesis or assistant accents. |
| Soft blue | #E8EFF8 / #365D88 | Planning and subject accents. |
| Positive green | #E7F2E9 / #2E6242 | Completion and positive status. |
| Risk pink/red | #FBE8ED / #A22E4D | Risk warnings and overdue work. |

Avoid highly saturated palettes, heavy gradients, excessive shadows, and overly playful illustrations. A light theme is sufficient for the first MVP; dark mode is not required.

### Typography, spacing, and shape

Use one readable sans-serif stack, initially the system font stack. Suggested hierarchy: page titles 28–32 px, section titles 18–20 px, body 14–16 px, and supporting text 12–14 px. Keep essential information readable at normal zoom; do not use tiny text to fit a busy dashboard.

Use a spacing scale based on 4 px, commonly 8, 12, 16, 24, and 32 px. Cards generally use 16–24 px padding and 12–16 px corner radii. Controls should share consistent height, radius, and focus treatment. Apply shadows mainly to floating panels and overlays; default cards can rely on borders.

### Semantic presentation

Risk badges always include text: LOW, MEDIUM, or HIGH. Suggested treatments are neutral/green for LOW, muted gold for MEDIUM, pink/red for HIGH. Subject color must not obscure risk color. Task status and session status use the exact domain meanings from SPEC.md, with human-readable labels such as “In progress” and “Partially completed”.

## 3. Desktop layout

Use a left sidebar, a flexible main content area, and a right assistant panel when space permits. A starting sidebar width is 220–240 px and assistant width 320–360 px; the main calendar and forms must retain adequate usable width.

Left navigation, in order:

1. Dashboard
2. Tasks
3. Subjects
4. Calendar
5. Deadlines
6. Progress
7. Settings

The sidebar shows the product name, a clearly highlighted current destination, and compact profile context. Settings contains essential preferences only. The header contains page title, relevant date/week controls, and a primary page action.

Main content hosts dashboard cards, the weekly planner, tables, charts, task lists, and forms. The assistant panel contains AI Study Assistant, chat history, recommendations, risk warnings, and action buttons. It can collapse to a clearly labeled Assistant control so the calendar can use the available width. Do not require chat to perform ordinary resource management.

## 4. Mobile layout

Use bottom navigation with Home, Calendar, Subjects, and Assistant. Home maps to Dashboard. Tasks, Deadlines, Progress, and Settings remain reachable through labeled Home shortcuts or a secondary menu; hiding them from bottom navigation must not make them inaccessible.

Prioritize a compact dashboard, today's priorities, the weekly plan, and the assistant. Use a single content column, stacked KPI cards, and task cards in place of wide tables. Primary add/edit actions should remain easy to reach. The assistant becomes a full screen destination, preserving the same conversation state as its desktop panel within the current app session.

The mobile calendar offers a week strip for date selection with the selected day's chronological agenda. Users can inspect all seven days without squeezing seven narrow columns onto the screen. Show time, task, subject, and status in each agenda item.

## 5. Dashboard

### Top KPI cards

| Card | Content and interaction |
| --- | --- |
| Tasks completed | Current completed total, linked to completed tasks. |
| Study time | Reported study time this week; show planned time separately if included. |
| Upcoming deadlines | Active deadlines in the next seven days; overdue count called out separately. |
| Overall progress | Backend-provided effort-weighted percentage and an accessible progress indicator. |

Use visible period labels so users do not assume every card covers the same interval. Show “No tasks” where progress has no denominator rather than a misleading percentage.

### Main widgets

- **Weekly study plan:** selected-week controls, compact day/session overview, and “Open calendar” / “Generate weekly plan”.
- **Study load:** planned versus available time per day, with units, legend, text alternative, and unallocated work shown separately.
- **Subject progress:** subject name, subtle color marker, progress bar, and remaining work.
- **Today's priorities:** backend-ordered tasks, next session time, deadline, priority, and short explanation where useful.
- **Upcoming deadlines:** chronological tasks with remaining work and risk labels; overdue items remain prominent.
- **AI assistant:** persistent panel on wide screens or a concise entry card when the panel is collapsed.

Use a two-column widget grid on wide screens and a single column as width decreases. Keep a serious risk or capacity shortfall near today's priorities rather than burying it below charts.

## 6. Calendar

The weekly schedule is the primary MVP calendar. Display the date range, previous/next week, Today, and Generate plan controls. Use local time labels and expose the profile timezone.

Each block shows subject, task, start/end time, and status. Apply subject color as a light background or narrow edge marker, with readable text. Use status text/icons to distinguish planned, completed, missed, and partial sessions. A block opens a detail view containing planned minutes, reported minutes, task progress, deadline, risk, and actions to record an outcome or request a move.

Show availability as a quiet background layer or explicit free-time window. Distinguish unavailable time, empty available time, and scheduled work. Add/edit availability through a form. Session movement uses a validated form or assistant action; drag-and-drop is not required for the MVP.

Generation and replanning results must summarize moved/split sessions and outstanding work. If a task cannot fit, show the shortfall and offer to edit availability, estimate, or deadline. Preserve the current calendar while displaying request errors. Never draw overlapping blocks as an apparent successful plan.

## 7. Tasks screen

Provide a task list with subject, title, deadline, priority, difficulty, progress, status, remaining work, and risk indicator. Use filters for subject, status, priority, deadline range, and risk, with clear active-filter and reset states. Allow deadline and priority sorting.

Desktop can use a table with a prominent task title and compact metadata columns. Mobile uses cards with title, deadline/risk, remaining work, and progress first; less frequent details can live in the task detail view.

The create/edit form includes subject, title, optional description, deadline with timezone context, total estimate, remaining work or progress input, priority, and difficulty. Keep effort and progress synchronized through the backend rules; mock fixtures may demonstrate the interaction but must not introduce an independent scheduling engine. Explain how estimate changes affect progress.

Task details provide edit, update progress, mark complete, cancel, and delete actions. Deletion warns about linked history; cancellation retains it. Show validation next to the relevant field and preserve entered values after failure. Recording a session outcome asks for actual minutes and revised remaining effort, since time studied and progress are separate.

## 8. Deadlines screen

Present a chronological overview with overdue work first, followed by upcoming dates. Each entry shows task, subject, due date/time, risk level, remaining work, usable time before the deadline, and any shortfall. Clearly label whether a number represents free capacity or time allocated to the task.

Offer risk filtering and direct actions to open the task, inspect its plan, or request rescheduling. Risk explanations should be concrete, such as “8 hours remaining; 3 usable hours before the deadline”. Show when the assessment was calculated and a refresh/error state if current risk is unavailable. Never substitute LOW for a missing result.

## 9. AI Assistant

Use a clean conversation layout with visually distinct user and assistant messages. Warnings use an icon, risk label, and supporting text. Action cards show their target task, relevant date/time, and whether the action is proposed, running, completed, or unsuccessful.

Example action buttons: Add focus block, Reschedule, Open task, and View deadline. Offer starter prompts for today's priorities, weekly planning, and risky deadlines without filling the screen with suggestions.

The assistant must distinguish an explanation from a saved change. On success, show confirmed backend details and update related views. On a conflict, explain the constraint and present valid alternatives. When “this task” or “Friday” is ambiguous, ask for the missing detail and show the resolved date. Keep provider names and internal tool syntax out of the normal student interaction.

Show sending/thinking states, a concise error with retry, and a clear demo label during the mock phase. Ordinary navigation and manual planning controls remain available if AI is unavailable. Do not render fixture responses as a live AI connection.

## 10. Responsive design and accessibility

Starting layout ranges, to validate against actual content:

| Range | Layout behavior |
| --- | --- |
| Wide desktop, about 1280 px and above | Sidebar, flexible content, optional assistant panel; collapse the panel if content becomes cramped. |
| Tablet/small desktop, about 768–1279 px | Collapsible sidebar/rail, reduced widget columns, assistant in a drawer or dedicated view. |
| Mobile, below about 768 px | Bottom navigation, single column, card lists, day agenda within weekly navigation. |

Desktop, tablet, and mobile share colors, typography, icons, statuses, spacing rules, and component behavior. Avoid whole-page horizontal scrolling. Where a chart or table requires scrolling, contain it and provide a usable compact alternative.

- Target WCAG 2.2 AA contrast and keyboard behavior during implementation, including visible focus states.
- Use semantic controls, labeled inputs, clear headings, accessible progress values, and text alongside color.
- Aim for touch targets of at least 44 by 44 CSS pixels and allow text zoom without hiding primary actions.
- Dialogs and drawers manage focus, support Escape, and restore focus to their trigger.
- Announce validation and action results appropriately without excessive live-region chatter.
- Provide text/table equivalents for chart data; do not rely on hover for essential detail.
- Use restrained motion and respect reduced-motion preferences.

## 11. UI implementation strategy

Implement the frontend with mock data first. Stabilize the main screens, navigation, responsive layouts, shared visual tokens, and important interaction states before connecting backend services.

Build reusable components for cards, badges, progress bars, task rows, planner blocks, navigation, buttons, form inputs, and risk indicators. Add shared empty/loading/error states and session-outcome forms where useful. Keep data fixtures separate from components, with shapes aligned to SPEC.md and a small data-access boundary that can later call REST endpoints.

Fixtures should cover normal workload, empty subjects/tasks, no availability, overdue work, a constrained plan, all risk levels, and planned/completed/missed/partial sessions. Include long titles and small-screen cases. Mock dashboard totals and risks should be internally consistent, and visibly marked as sample data. UI formatting and local form feedback are permitted; authoritative metric aggregation, planning, and risk decisions belong to future backend services.

Suggested build sequence: shared tokens and shell; Dashboard; Tasks and Subjects with forms; Calendar and availability; Deadlines and Progress; assistant panel and action states; responsive and accessibility review. Use the same subject colors across all screens. Progress should show completed versus remaining effort and reported study time using the definitions in SPEC.md, without introducing gamification.

Before API integration, verify navigation access on each layout, readable dense and empty states, form and dialog behavior, calendar overflow, keyboard use, and clearly communicated planning shortfalls. The next phase replaces fixtures with backend data while retaining these interactions and presentation components.


## Authentication and profile surfaces

Sign In, Sign Up, Check Email, Forgot Password and Reset Password use the existing warm background, white bordered cards, typography, inputs and restrained buttons. Auth resolution is a neutral loading gate, with no planner data behind it. Google sign-in is a secondary action. Identity is shown using the existing circular sidebar/header avatar or initials.

Settings adds an Account panel for display name, Auth email, avatar upload/removal, fixed Budapest timezone and sign out. The deletion controls are collapsed, explain permanent consequences and require typing DELETE before enabling the destructive action. Existing study preferences and planner screen design remain unchanged. Profile/network errors use existing feedback styles. Avatars keep the same circular dimensions; account changes clear previous images immediately.
