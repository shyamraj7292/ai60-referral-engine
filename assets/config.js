/* AI60 referral engine — configuration. This is the only file you need to edit. */
window.AI60_CONFIG = {
  // Google Apps Script web-app URL (see SETUP.md). Leave empty to run in demo mode.
  API_URL: '',

  // Public URL of the sign-up page, used to build referral links.
  // Empty = the URL this page is served from.
  SITE_URL: '',

  GOAL: 500,
  FINAL_YEAR: 2027,

  WORKSHOP: {
    title: 'Build Your First AI Project in 60 Minutes',
    startISO: '2026-10-18T18:00:00+05:30',
    durationMin: 60,
    dateLabel: 'Sun, 18 Oct',
    timeLabel: '6:00 PM IST',
    platform: 'Live online'
  },

  // Day 1 of the 7-day campaign (IST, 'YYYY-MM-DD'). null = the day of the first sign-up.
  CAMPAIGN_START: null,

  // Cumulative sign-ups the growth plan expects by the end of each campaign day.
  PLAN_TARGETS: [30, 145, 250, 325, 415, 490, 540],

  // Budget held back for the last-call push (₹), offered to the best paid channel.
  RESERVE_BUDGET: 200,

  // Hide the public "N students registered" counter until it is worth showing.
  SOCIAL_PROOF_MIN: 50
};
