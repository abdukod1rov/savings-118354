# House savings tracker

**Live:** https://abdukod1rov.github.io/savings-118354/

A single static page that tracks progress toward buying a house.

- **Goal:** 400 000 000 so'm — the number being tracked against.
- **Real house price:** 600 000 000 so'm — shown alongside, on its own scale,
  so the real number stays in view without becoming the bar.

Everything on the page — totals, percentages, the chart, the pace, the
projected date — is calculated from one file: **`data.js`**. There is no build
step, no `npm install`, and no dependencies. Open `index.html` in a browser and
it works, whether from a local file or from GitHub Pages.

`data.js` holds one real entry: an opening balance of 150 000 000 so'm on
2026-11-19. Every deposit from here gets appended below it.

---

## How to update the numbers

Open **`data.js`** and add one line at the bottom of the `entries` list:

```js
entries: [
  { date: "2026-11-19", balance: 150_000_000, note: "starting balance" },
  { date: "2026-12-05", amount: 12_000_000 },   // <-- the new line
],
```

- `date` is `YYYY-MM-DD`.
- `amount` is **how much you added that day**, not the new total. The page adds
  it up for you.
- The underscores in `12_000_000` are just for readability — valid JavaScript,
  and you can leave them out if you prefer.
- `note: "..."` is optional and shows up in the history table.

Then:

```bash
git add data.js && git commit -m "savings: Dec 2026" && git push
```

GitHub Pages redeploys in about a minute. Reload the page and everything —
the bar, the dial, the chart, the projected date — has moved.

**If the numbers look unchanged after a push,** it is the browser's cache
holding the old `data.js`, not a failed deploy. GitHub Pages lets browsers
keep files for about ten minutes. Force a reload to see it immediately:
`Cmd+Shift+R` on a Mac, `Ctrl+F5` on Windows, or pull-to-refresh on a phone.

### If you get out of sync with your bank

Sometimes it's easier to just state the real total than to reconstruct every
deposit. Use `balance` instead of `amount` and the running total is reset to
that number on that date:

```js
{ date: "2026-12-05", balance: 137_500_000, note: "from bank statement" },
```

Entries after it carry on from there. The history table tags the row
`balance set` and shows the implied difference, so nothing is hidden.

### Changing the goal or the price

Top of the same file:

```js
goal: 400_000_000,        // the target you track against
housePrice: 600_000_000,  // what the house actually costs
currency: "so'm",
```

Set `housePrice: 0` to hide the real-price row entirely.

### If you mistype something

The page tells you instead of silently showing wrong numbers: a red box
appears at the bottom naming the entry and the problem (bad date, missing
amount). Fix it, reload.

---

## Turning on GitHub Pages

Already done for this repository — it is live at the URL above, and every
`git push` to `main` redeploys it. The steps below are for setting it up
again somewhere else.

> **If a Pages URL redirects somewhere that will not load,** check whether
> `abdukod1rov.github.io` has a `CNAME` file. A custom domain on the user
> site redirects *every* project page to that domain, so if the domain is
> not registered and pointing at GitHub, all of them break at once.

1. Create a repository on GitHub and push this folder to it:

   ```bash
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```

2. On GitHub, go to the repository's **Settings** → **Pages** (left sidebar).
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to **`/ (root)`**, then **Save**.
5. Wait a minute or two. The site appears at
   `https://<your-username>.github.io/<repo>/`.

Every later `git push` redeploys it automatically.

**A note on privacy:** a public repository means anyone who finds the URL can
see how much you have saved. If you would rather keep that to yourself, make
the repository **private** — GitHub Pages works on private repositories on
paid plans; on the free plan, Pages requires the repository to be public.
The alternative is to keep the repo private and just open `index.html` from
your own disk, which works exactly the same.

---

## What the page shows

**Sidebar** — saved, left to goal, the goal, % complete, the real house price,
and the gap to that price. Plus a progress ring and the light/dark/auto theme
button.

**Hero** — saved and still-to-go in large type, then a progress bar whose full
width is the 400 mln goal.

**Chart** — balance over time, hand-drawn in SVG (no chart library, nothing
loaded from a CDN). Dashed line is the goal; a faint line projects forward when
the goal is within about three years. Tap or hover a dot for the exact figure.

**History** — every entry, newest first, with the running balance and what
percent of the goal it represented at the time.

---

## Files

| File | What it is |
|---|---|
| `data.js` | **The only file you edit.** Goal, price, and every entry. |
| `index.html` | Page structure. |
| `styles.css` | Styling, light + dark, phone layout, print. |
| `app.js` | All the maths and the SVG chart. |

### Why `data.js` and not `data.json`

So the page works when you open `index.html` straight from your disk. Reading a
`.json` file needs `fetch()`, which browsers block on `file://` URLs for
security — the page would be blank until you ran a local web server. A `.js`
file loaded with `<script>` has no such restriction, so the same file works
both from disk and from GitHub Pages. Editing it is no harder: it is a plain
list, just with `//` comments allowed.
