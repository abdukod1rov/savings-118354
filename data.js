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

  // What the house actually costs. Shown alongside, so the real number
  // stays in view without becoming the bar you measure yourself against.
  housePrice: 600_000_000,

  currency: "so'm",

  entries: [
    // Where you stood when this tracker started. `balance` states the total
    // outright, so it is not counted as money saved in the last 90 days.
    { date: "2026-11-19", balance: 150_000_000, note: "starting balance" },

    // From here on, one line per deposit:
    //   { date: "2026-12-05", amount: 12_000_000 },
  ],
};
