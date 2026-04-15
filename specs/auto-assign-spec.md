# Auto-Assign Scheduling Tool — Spec

## Overview

A "Suggest Assignments" button on the Assignment Board that automatically proposes professor-to-program assignments using weighted scoring, optimizing for compliance, consistency, and efficiency. All suggestions are previewed before committing — nothing saves automatically.

---

## Data Inputs (all already in DB)

### Programs to assign
- Unassigned programs in the selected date range/areas
- Each has: day(s) of week, time, location, class_type (science/engineering/robotics/finlit), livescan/virtus/tb requirements

### Available professors
- Active, Substitute, Training status
- Availability table: which days/times they're free
- Training flags: science_trained_id, engineering_trained_id, robotics_trained_id, etc.
- Livescans: which locations/contractors they're cleared for (livescan table)
- Virtus, TB compliance
- Geographic area (home territory)
- Current assignments (already assigned programs in this period)

### Historical data
- Past programs: which professors have taught at which locations
- Past programs: which class types each professor has taught

---

## Scoring Algorithm

For each (program, professor) pair, compute a score. Higher = better fit.

### Hard constraints (disqualify if not met)
- Professor must have availability on the program's day of week
- Professor must not have a time conflict (overlapping session at the same time)
- Professor must have the required training for the class type
- Professor must not have a day_off on any session date

### Soft scoring weights

| Factor | Points | Logic |
|--------|--------|-------|
| **Livescan match** | +50 | Professor has active livescan at the program's location or contractor |
| **Virtus match** | +20 | Location requires Virtus AND professor has it |
| **TB match** | +20 | Location requires TB AND professor has it |
| **Already at same location** | +30 | Professor is already assigned to another program at this location this session (reduces travel, fewer people at one school) |
| **Same class type consistency** | +25 | Professor is already teaching this class type elsewhere (minimize type variety per professor) |
| **Taught at location before** | +15 | Professor has taught at this location in any past session |
| **Taught this class type before** | +10 | Professor has taught this specific class/module before |
| **In home territory** | +10 | Program's location is in the professor's geographic area |
| **Fewer total assignments** | +5 | Prefer professors with fewer current assignments (balance load) |
| **Higher rating** | +3 × rating | Slight preference for higher-rated professors |

### Tiebreakers
1. Highest total score wins
2. If tied: prefer professor with fewer total assignments (load balance)
3. If still tied: prefer professor with higher rating
4. If still tied: alphabetical by nickname (deterministic)

---

## Assignment Strategy

### Greedy with priority ordering

1. **Sort unassigned programs by difficulty** (hardest to fill first):
   - Programs at locations requiring livescan → highest priority
   - Programs requiring Virtus/TB → next
   - Programs at locations with fewer available professors → next
   - Multi-day programs → higher priority (harder to fit)

2. **For each program** (in priority order):
   - Score all eligible professors
   - Assign the highest-scoring professor
   - Update the professor's "current assignments" so subsequent scoring accounts for the new assignment

3. **Multi-day programs**: When a multi-day program is assigned, it blocks that professor's time on ALL days the program runs

### Optimization passes (optional, v2)
- After initial greedy assignment, do a swap pass: for each pair of assignments, check if swapping professors improves total score
- This handles cases where greedy order missed a globally better solution

---

## API Endpoint

### POST /api/assignment-board/suggest

**Request:**
```json
{
  "areas": ["Central LA", "Valley"],
  "start_date": "2026-01-12",
  "end_date": "2026-03-20",
  "only_unassigned": true,  // only suggest for programs without a professor
  "lock_existing": true     // don't reassign programs that already have someone
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "program_id": 14001,
        "program_nickname": "GOETHE - EXP 26",
        "suggested_professor_id": 1307,
        "suggested_professor_name": "Sonia Escamilla",
        "score": 135,
        "score_breakdown": {
          "livescan": 50,
          "same_location": 30,
          "same_type": 25,
          "taught_here_before": 15,
          "in_territory": 10,
          "rating": 5
        },
        "current_professor_id": null,
        "reasons": ["Has livescan at GOETHE", "Already teaching at GOETHE Mon", "Science trained"]
      }
    ],
    "unassignable": [
      {
        "program_id": 14050,
        "program_nickname": "MALIBU - ROB 26",
        "reason": "No eligible professors with availability on Thursday 2:30-3:30 PM"
      }
    ],
    "stats": {
      "total_programs": 45,
      "suggested": 38,
      "unassignable": 7,
      "avg_score": 87.4
    }
  }
}
```

---

## UI Flow

### 1. Button on Assignment Board
- "Suggest Assignments" button in the header (next to Save Changes)
- Only enabled when there are unassigned programs
- Options toggle: "Only unassigned" (default on) vs "Reassign all" (recalculate everything)

### 2. Preview Modal / Panel
- Shows a table of all suggestions sorted by score (highest first)
- Each row: Program name, Suggested Professor, Score, Key Reasons
- Color-coded confidence: Green (score > 100), Amber (50-100), Red (< 50)
- Checkbox per row to include/exclude individual suggestions
- "Unassignable" section at bottom showing programs that couldn't be filled and why

### 3. Apply
- "Apply Selected" button fills the assignment board with the suggestions
- Does NOT save — just populates the board like manual drag-and-drop
- User reviews the board, makes adjustments, then clicks "Save Changes" as normal
- "Apply All" button for quick acceptance

### 4. Score details
- Click a suggestion row to see full score breakdown
- Shows why each factor scored what it did
- Helps user understand and trust the suggestion

---

## Database Queries Needed

### Professor eligibility (per program)
```sql
-- Available on the right day
SELECT professor_id FROM availability
WHERE weekday_id = ? AND active = 1

-- No day_off on session dates
SELECT professor_id FROM day_off
WHERE date_requested IN (session_dates) AND active = 1

-- Has required training
-- Check science_trained_id, engineering_trained_id, etc. on professor table

-- Has livescan at location
SELECT professor_id FROM livescan
WHERE (location_id = ? OR contractor_id = ?) AND active = 1

-- Time conflict check
-- No overlapping session at the same time on the same day
```

### Historical data (for scoring)
```sql
-- Taught at this location before
SELECT DISTINCT prog.lead_professor_id
FROM program prog WHERE prog.location_id = ? AND prog.active = 1

-- Current assignments in period
SELECT prog.lead_professor_id, prog.location_id, cl.class_type_id
FROM program prog
JOIN class cl ON cl.id = prog.class_id
WHERE prog.lead_professor_id IS NOT NULL
  AND prog.first_session_date <= ? AND prog.last_session_date >= ?
```

---

## Edge Cases

- **Professor at max capacity**: Define a soft cap (e.g., 5 classes per week). After cap, scoring penalty of -20 per class over cap.
- **Split schedules**: Some professors are only available certain hours. Time-of-day matching must be precise.
- **Assistants**: v1 only assigns lead professors. v2 could handle assistant assignments separately.
- **Substitute-status professors**: Lower priority than Active. Score penalty of -10 for Substitute, -20 for Training.
- **Multi-day programs**: Must check availability on ALL days, not just one.
- **Same professor, same time, different location**: Impossible — hard constraint.

---

## Implementation Phases

### Phase 1: Core scoring + greedy assignment
- Build the scoring function
- Build the greedy assignment loop
- API endpoint returns suggestions
- Basic preview UI on assignment board

### Phase 2: Polish
- Score breakdown detail view
- Confidence color coding
- "Unassignable" reasons
- Selective apply (checkbox per suggestion)

### Phase 3: Advanced (optional)
- Swap optimization pass
- "What-if" mode: lock certain assignments, re-run for remaining
- Weekly auto-run with email summary to scheduling coordinators
- Historical performance weighting (observation scores affect professor preference)

---

## No New Tables Required

All data comes from existing tables:
- `professor`, `availability`, `day_off`, `livescan`
- `program`, `session`, `location`, `class`, `class_type`
- `professor_status`, `geographic_area`

Only new code: one API endpoint + scoring logic + frontend preview panel.
