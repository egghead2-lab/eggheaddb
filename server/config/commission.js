/**
 * Sales Commission — hardcoded thresholds (spec §2.3).
 * Admin UI to edit these comes in V2. Changes here need a code deploy.
 */
module.exports = {
  // Non-retained program requirements
  MIN_ENROLLMENT: 100,           // location.location_enrollment must be >= this
  MIN_WEEKS_FULL: 6,             // session_count >= this → full flat-fee
  MIN_WEEKS_PRORATE_DENOM: 8,    // prorated formula: flat_fee × (session_count / 8) — 6 weeks = 75%
  BOOKED_AHEAD_DAYS: 21,         // first_session_date - program.ts_inserted must be >= this
  MARGIN_THRESHOLD: 0.10,        // (parent_cost - our_cut - lab_fee) / parent_cost must be >= 10%

  // Initial vs. rebook sibling clustering
  SIBLING_GROUPING_WINDOW_DAYS: 30,  // independent of invoicing module per Nick 2026-04-21

  // Plan defaults (used when creating a new plan and nothing else specified)
  DEFAULT_MONTHLY_QUOTA: 50000.00,
  DEFAULT_INITIAL_RATE: 0.0500,
  DEFAULT_REBOOK_RATE: 0.0250,
  DEFAULT_NON_RETAINED_FLAT_FEE: 250.00,

  // Retained client statuses that count as confirmed (not cancelled)
  // Class_status names NOT starting with 'Cancelled'
};
