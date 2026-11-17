# AI Study Planner — Project Overview

Status: initial project baseline. This document describes the intended product, not a claim that its features are already implemented.

## 1. Project overview

AI Study Planner is a university semester project: an intelligent study planning application for students managing several subjects, assignments, and deadlines. It brings task management, a study calendar, progress reporting, deadline risk detection, and an AI assistant into one application.

Students often face overlapping deadlines, unclear workloads, unrealistic plans, and difficulty choosing what to do first. A missed study session can make a manually maintained calendar inaccurate. The application should create and maintain a realistic plan using the student's workload and available time, helping answer three questions: **What should I study? When should I study it? What is at risk?**

The backend calculates the plan. The AI assistant provides a conversational interface to that plan and its underlying services.

## 2. Project goals

- Give students a clear overview of subjects, tasks, deadlines, and progress.
- Turn estimated remaining work and availability into a feasible weekly study schedule.
- Reduce the effort of deciding which task to study next.
- Expose deadline risks and capacity shortfalls before work becomes overdue.
- Adjust future study sessions when work, deadlines, or availability change.
- Explain planning results through an assistant grounded in actual backend data.
- Demonstrate a modular, deterministic, testable implementation appropriate for a semester project.

The application supports better decisions; it cannot guarantee completion or correct inaccurate workload estimates. An infeasible plan must be reported honestly rather than hidden behind a full-looking calendar.

## 3. Target users

The primary user is a university student handling multiple subjects and assignments during a semester. The student enters subjects, tasks, assignment deadlines, estimated and remaining hours, priority, difficulty, progress, and available study periods.

The MVP assumes one student profile in a personal workspace. A basic User model leaves room for later account support, without introducing complex authentication, teams, or shared schedules.

## 4. Core value proposition

A normal todo-list records work and a calendar records time. AI Study Planner connects the two and maintains the relationship as circumstances change.

| Capability | Student benefit |
| --- | --- |
| Automatic study planning | Work is distributed into available periods using deadlines, remaining effort, priority, and difficulty. |
| Dynamic replanning | Missed or partial sessions and changed constraints lead to updated future sessions. |
| Deadline risk detection | Students can see when the remaining work may exceed available time. |
| AI-assisted interaction | Students can ask questions and request changes in ordinary language through validated backend actions. |

For example, a Database assignment due in two days with three hours remaining should be considered alongside a six-hour Project Management report due in five days and an eight-hour thesis review due in fourteen days. The backend allocates available time and reports any work that cannot fit. The assistant explains that result.

## 5. Existing solutions

These are brief reference points, not an exhaustive feature comparison. Product descriptions were checked against official pages on 2026-10-28 and may change.

| Product | Relevant focus |
| --- | --- |
| [MyStudyLife](https://mystudylife.com/tour/) | Academic planning for classes, homework, exams, deadlines, and revision. Its current offering also describes AI-assisted revision planning. |
| [Motion](https://www.usemotion.com/) | Work productivity with automatic task prioritization, calendar scheduling, and warnings about work at risk. |
| [Reclaim.ai](https://reclaim.ai/) | Work calendar automation, including finding time for tasks, focus work, and scheduling around competing commitments. |

AI Study Planner's intended differentiation is its focused combination of academic subjects and assignments, explicit study availability, visible deadline risk, automatic replanning, and backend-grounded AI assistance in a manageable student project. This is a product focus, not a claim that competing products lack all of these capabilities.

## 6. MVP scope

| Area | Required MVP capability |
| --- | --- |
| Subjects | Create, view, edit, and delete university subjects. |
| Tasks | Manage assignments and study tasks, estimates, remaining work, priority, difficulty, and progress. |
| Deadlines | Show upcoming and overdue task deadlines. |
| Availability | Enter dated periods available for studying. |
| Weekly planner | View study sessions in a weekly calendar. |
| Automatic scheduling | Generate non-overlapping sessions within availability and before deadlines where feasible. |
| Deadline risk | Calculate and explain LOW, MEDIUM, HIGH, and CRITICAL risk. |
| Automatic replanning | Adjust affected future sessions after missed work or changed constraints. |
| Dashboard and progress | Present study time, task completion, workload, subject progress, and priorities. |
| AI assistant | Answer from backend state and invoke predefined, validated application actions. |

Dashboard, Tasks, Subjects, Calendar, Deadlines, Progress, and AI Assistant are the main application areas. Settings provides only essential profile and planning preferences, such as timezone; it is not an additional feature platform.

## 7. Out of scope

The first MVP excludes Google Calendar integration, PDF assignment import, push notifications and other notification delivery, social features, collaboration, gamification, and complex authentication. These may be future extensions after an explicit specification update.

Other external calendar integrations, a full academic timetable system, and separate exam-management workflows are not assumed. Exam preparation can be represented as ordinary study tasks. Focus blocks are task-linked study sessions rather than a separate productivity subsystem.

## 8. Technology stack

| Layer | Planned technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL hosted by Supabase; accessed through FastAPI and SQLAlchemy |
| AI | Replaceable LLM provider accessed through a backend abstraction |

The backend foundation uses SQLAlchemy 2.x, Alembic, Pydantic v2, and psycopg. Supabase provides PostgreSQL hosting; frontend database access is not used. Backend setup and pinned dependencies are documented in backend/README.md. Charting packages and AI providers remain choices for their corresponding implementation phases. No provider-specific business logic should leak into the planning engine or frontend.

## 9. High-level architecture

The MVP should use one frontend, one modular backend application, and one database. Separate services or deployment infrastructure are unnecessary unless a demonstrated requirement emerges.

| Layer | Responsibility |
| --- | --- |
| Frontend | Forms, navigation, calendar, charts, assistant UI, and rendering backend results. |
| REST API | Validate requests, expose resources and commands, and map service results to responses. |
| Business services | Apply task lifecycle rules, progress updates, availability changes, and transaction boundaries. |
| Planning engine | Calculate task ordering, study allocations, and unscheduled work deterministically. |
| Deadline risk engine | Assess remaining work against time and competing demand; return risk and explanation data. |
| Replanning service | Identify affected future allocations and coordinate planning and risk recalculation. |
| AI assistant layer | Interpret natural language, fetch context, call allowed services, and explain confirmed results. |
| Persistence layer | Store profiles, subjects, tasks, availability, and study sessions in PostgreSQL. |

Normal interaction flows from frontend to REST API to business services and persistence. Planning and risk calculations receive explicit snapshots and return results; orchestration services persist approved valid outcomes. Assistant requests pass through the same business services, validation, and planning constraints as ordinary UI requests.

The LLM does not calculate schedules, assign authoritative risk levels, write directly to the database, or invent IDs, progress, or session results. Provider failures must leave ordinary task management and deterministic planning usable.

## 10. Development phases

| Phase | Deliverable and exit condition |
| --- | --- |
| 1. Documentation | PROJECT.md, SPEC.md, and DESIGN.md establish scope, behavior, and UX. |
| 2. UI with mock data | Main screens and reusable components demonstrate responsive layouts and important states. |
| 3. Backend and database | Domain models, persistence, validation, and resource operations work against PostgreSQL. |
| 4. API integration | Frontend reads and writes real resources with loading and failure handling. |
| 5. Planning engine | Deterministic scheduling produces feasible sessions and reports unallocated work. |
| 6. Deadline risk detection | Deterministic risk assessments expose reasons and capacity shortfalls. |
| 7. Automatic replanning | Missed sessions and changed constraints update the affected future plan. |
| 8. AI assistant | Replaceable provider uses defined actions and backend context. |
| 9. Testing and polish | End-to-end workflows, accessibility, responsive behavior, and demo quality are verified. |

Tests for business invariants should accompany their implementation; phase 9 consolidates verification rather than postponing all testing. During phase 2, planning and AI outputs are clearly labeled fixtures, with no scheduling algorithm embedded in frontend components.

## 11. Engineering principles

1. Business logic belongs in backend services.
2. Frontend components must not calculate scheduling, priority, or risk decisions.
3. Scheduling must be deterministic and testable, including stable tie-breaking and an explicit evaluation time.
4. Deadline risk calculation must be deterministic and testable.
5. The AI assistant must use backend application state and acknowledge missing information.
6. AI actions must call backend services and follow the same validation as UI actions.
7. Features outside the documented MVP require an explicit specification update first.
8. Keep modules understandable and dependencies clear; prefer simple solutions over enterprise complexity.
9. Avoid unnecessary abstractions; introduce them for concrete needs, including the replaceable AI provider.
10. Use English for code, comments, filenames, and technical documentation.
11. Preserve completed work and expose infeasibility instead of silently losing workload.

## Documentation ownership and open decisions

Use this document for product scope, [SPEC.md](SPEC.md) for functional behavior and domain rules, and [DESIGN.md](DESIGN.md) for UX and visual direction. Keep changes consistent across them. These files supersede the introductory conversation as the written baseline.

Working assumptions are documented in SPEC.md. Final scheduling weights, risk thresholds, block-duration defaults, and exact API schemas remain open. Resolve and document them before implementing the corresponding engine or contract.
