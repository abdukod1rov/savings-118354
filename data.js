/* ===========================================================================
   THIS IS THE ONLY FILE YOU EDIT.
   ---------------------------------------------------------------------------
   To log a new deposit: add one line at the BOTTOM of the `entries` list.

       { date: "2026-12-05", amount: 12_000_000 },

   `amount` is how much you ADDED that day. The balance is the running total.
   Dates are YYYY-MM-DD. Underscores in numbers are just for readability.

   Got out of sync with your bank? Use `balance` instead of `amount` to say
   "the real total on this date was exactly this" — it resets the running
   total and everything after it continues from there:

       { date: "2026-12-05", balance: 137_500_000, note: "bank statement" },

   `note` is optional and shows up in the history table.
   Save -> commit -> push. GitHub Pages redeploys in about a minute.
   =========================================================================== */

window.SAVINGS = {
  // The goal you are tracking against — your "sweet spot".
  goal: 400_000_000,

  // What the house actually costs. Not shown as a figure any more — it only
  // draws a line on the chart once savings reach the top of its scale.
  // Set it to 0 to drop it completely.
  housePrice: 600_000_000,

  currency: "so'm",

  entries: [
    // History up to 19 Nov: these eight add up to 150 000 000, the balance
    // on that date. The split between the dates is approximate.
    { date: "2026-08-15", amount: 17_500_000 },
    { date: "2026-08-29", amount: 21_000_000 },
    { date: "2026-09-12", amount: 15_500_000 },
    { date: "2026-09-26", amount: 19_000_000 },
    { date: "2026-10-10", amount: 18_500_000 },
    { date: "2026-10-24", amount: 15_000_000 },
    { date: "2026-11-04", amount: 21_500_000 },
    { date: "2026-11-19", amount: 22_000_000 },

    // Logged as they happen from here:
    { date: "2026-11-21", amount: 26_000_000 },
  ],
};
