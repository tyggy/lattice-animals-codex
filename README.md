# Gettyggy — Lattice Animals, built with Codex

Our entry for the September 25, 2026 CIMC Lattice Animals hackathon. One JavaScript controller coordinates its cells to form the requested shapes, survive greedy matching, and preserve energy.

**Final hackathon strategy and current baseline: A14.** Last captured standings: **59 Arena wins (tied fourth)** and **8 Clash wins (third)** at 19:37 PDT. These are the last saved leaderboard values, not a verified statement of the hackathon's overall awards. [Results and post-mortem](docs/POSTMORTEM.md) · [What Baconian did differently](docs/BACONIAN.md).

## Run locally

Node.js 24 or newer. No npm dependencies.

```sh
npm test
npm run verify
npm run gym -- --seeds 2 --start 5801 --output runs/example.jsonl
```

The gym runs full 16-round games with 64 turns per round, 32 cells per player, a 64×64 board, 500 ms deadlines, and both seats for each seed. Its default comparison is A14 against A13. It has **two contestants and no neutral hive golem**; it does not reproduce every live Arena setting. Work is time-bounded, so identical seeds do not guarantee identical trajectories across machines or loads.

To repeat the qualification protocol or test the rejected candidate:

```sh
npm run gym -- --seeds 20 --start 5801 --output runs/a14-vs-a13.jsonl
npm run gym -- --candidate insurance-a15b --opponent handoff-a14 --seeds 20 --start 6001 --output runs/a15b-vs-a14.jsonl
```

To compare against the reviewed Baconian source (downloaded separately):

```sh
git clone https://github.com/ebrinz/baconian-lattice-intimato ../baconian-lattice-intimato
git -C ../baconian-lattice-intimato checkout 11198e34a68e93c4fa8b1a940d83557e3b354466
npm run gym -- --opponent-module ../baconian-lattice-intimato/player.js --seeds 10 --start 7601 --output runs/baconian.jsonl
```

Existing outputs are never overwritten. Frozen dependency hashes are preserved in each release manifest. The original qualification scorecards and summaries are in `results/`; replaying the protocol is not a claim that a new run must reproduce each original score.

## Connect to a compatible server

```sh
export LATTICE_TOKEN='your-player-token'
node client.js
```

The default endpoint is `wss://latticeanimals.com/ws`, which was unreachable when this repository was published. An alternative endpoint can be passed as `node client.js "$LATTICE_TOKEN" wss://your-server/ws`. Keep exactly one player client per account. Use a service manager for crash/reconnect recovery; a laptop cannot play while asleep. The client supports server resume messages, but this repository does not install an always-on service.

The public wrapper selects the unchanged frozen A14 entry. The transport adds environment-based token loading for publication. It does not read the author's machine-specific `.env` file.

## Strategy

- Build complete own formations, with bounded search and path repair.
- Evaluate the game's greedy global matcher, since owning a complete shape does not guarantee it receives a match.
- Use coordinated deadline movement to defend against overlapping earlier-scanned formations.
- Repair certain enclosed vacancies with a two-step movement chain (A13).
- Trade a healthy formation member for a nearby critical spare when an ideal-packing value model predicts a worthwhile future energy gain (A14).

A14 does **not** make LLM/Jev calls or use persistent named-opponent memory. Those were separate experiments, not ingredients of the final deployment. Public cells are anonymous; inferred foreign behavior is not authenticated ownership.

| Frozen candidate | Qualification | Decision |
|---|---|---|
| A13 gate repair vs A11 | 21–19, +0.525 mean energy margin | Deployed |
| A14 selective handoff vs A13 | 26–14, +3.025 mean energy margin | Final deployment |
| A15b support insurance vs A14 | 18–18–4, zero mean energy margin | Rejected |
| A16 broader gate repair vs A14 | 20–20, zero mean energy margin | Rejected after server resumed |

Each comparison used 20 seeds, both seats. These are separate local batches, not a ranking against every live opponent. The small champion **stand-in** screens were not tests against Baconian's actual source.

## Layout

- `player.js`: public entry for frozen A14.
- `codex/releases/`: A11, A13, A14 and rejected A15b/A16, with original manifests.
- `codex/game/`: reference game engine from the contestant kit.
- `evaluation/`: isolated-worker gym and paired-seat runner.
- `tests/`: engine-checked handoff and support-insurance regressions.
- `results/`: saved scorecards, summaries, final available standings and health-qualified live results.
- `docs/`: post-mortem and source-based Baconian comparison.

Known limitations include a broader two-cell P5 routing case that A13 does not cover, rare availability of A14 handoffs, and an inherited deadline-dodge movement model that does not explicitly reject two-cell swaps. The A15b resolver fixes that last modeling issue for its own insurance evaluations, but it was not promoted into A14.

## Attribution

Built by Anton Borzov with OpenAI Codex for the About Blank research program. The independent Claude entry was **tyggy**; this repository contains **gettyggy's** strategy.

The reference engine, protocol and initial client derive from the organizer's [LACK contestant kit](https://github.com/cimcai/LACK). Their provenance remains separate from our strategy and evaluation work. This publication does not assign a new blanket license to upstream material. [Baconian](https://github.com/ebrinz/baconian-lattice-intimato) is credited and linked, not vendored. No private Claude strategy, credentials, browser session data or raw conversation archive is included.
