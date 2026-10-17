# DuelLog Web

A static analytics website for DuelLog's WoW Forever data. React 19, TypeScript and Vite. The site reads its records from a project JSON file; it has no in-app import workflow or backend.

## Run

Requires Node.js 22.12+ or a newer supported release.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. It binds to `127.0.0.1` by default.

```sh
npm run build
npm run preview
```

## Publish

The GitHub Actions workflow in `.github/workflows/deploy.yml` tests, lints, builds and deploys the site to GitHub Pages on every push to `main`. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source if it is not selected automatically. The expected site URL is `https://marcos-lindmayer.github.io/duellog-web/`.

## Data

Edit [`public/data.json`](public/data.json) and reload the page. It is the single source of truth; there is no import button or browser-side archive. Each duel uses Unix time in seconds and uppercase class tokens.

```json
{
  "duels": [
    {
      "winner": "Alpha Foreverpvp",
      "loser": "Beta Othername",
      "timestamp": 1792091772,
      "forfeit": false,
      "winnerClass": "PALADIN",
      "loserClass": "MAGE",
      "realm": "Classic Beta PvP",
      "zone": "Durotar",
      "subzone": "",
      "observer": "",
      "message": ""
    }
  ],
  "playerClasses": {}
}
```

Required duel fields are `winner`, `loser` and `timestamp`. `forfeit` is a boolean; class, realm, zone, subzone, observer and message fields are optional. Class values are `WARRIOR`, `PALADIN`, `HUNTER`, `ROGUE`, `PRIEST`, `SHAMAN`, `MAGE`, `WARLOCK`, `DRUID`, `DEATHKNIGHT`, `MONK`, `DEMONHUNTER`, `EVOKER` or `UNKNOWN`. Keep the JSON valid, including commas and quotes.

The parser also supports the addon's SavedVariables and export formats for compatibility tests, but the website itself does not expose an import interface. The compressed test fixture is synthetic. Class icons are from Wowhead's icon CDN; fonts load from Google Fonts. This project is unaffiliated with Blizzard or Wowhead.

## Views

- Sim ladder: chronological zero-sum Elo, 1500 start, K=32, expected-score scale 400. Exact duplicate and self-match records do not change MMR.
- Leaderboard: 95% Wilson lower-bound ranking with games played and raw win rates.
- Duel history: names/classes, time, location, victory and forfeit results.
- Classes: cross-class overview; mirrors are excluded from overview rates but included in drilldowns.
- Player profiles: matchups, opponent records, Elo chart, peak rating, recent form and opponent diversity.
- Data quality: class coverage and repeated-opponent concentration.

Name and class filters do not remove opponents from Elo calculations. Tourny only requires both exact surnames to be Foreverpvp. Ratings describe observed history, not Blizzard MMR or a complete server ladder.

## Verification

```sh
npm test
npm run lint
npm run build
```

The checked-in compressed fixture comes from the actual Lua exporter using synthetic data. Set `DUELLOG_SAVE` to a private SavedVariables path to additionally test real local data without committing it.

## Public deployment boundary

The site does not upload data. However, `public/data.json` is served as a static asset: anyone who can access a deployed site can also read that file. Keep private records out of it before deploying publicly.
