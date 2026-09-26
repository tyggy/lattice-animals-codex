# A18: choose which cells survive

September 25, 2026. A18 qualified locally and was confirmed playing under the live source hash at 21:33 PDT. A14 remains available for rollback.

## What the loss traces showed

Against the pinned public Baconian source, A14 lost both seats of seed 7603 by 37–50 and 31–49. In **every round of both games**, its matched count reached the own-only packing ceiling. The energy gap did not require a missed formation to explain it.

Baconian reached 30 cells early. Our cells kept taking distributed damage at 32, then passed through populations with worse remainders. Thirty fits shapes of size 3, 5 and 6 exactly; 31 always leaves spares for this catalogue. But 32 is better for size 4. The right choice depends on the distribution of future shapes and the remaining horizon—not a universal rule to reduce to 30.

The winning control seed 7604 supplies a counterexample: retaining 32 through several four-cell rounds was advantageous. This is why the candidate retains a finite-horizon value model rather than copying a fixed population target.

## What changed

A14 already estimated future terminal energy under ideal own-only packing. Its physical intervention was a short handoff after formations were complete, and it could save a critical spare but could not deliberately leave a different critical member unmatched.

A17 applies the same value model during early assignment. It chooses the healthy/critical composition of unavoidable spare cells. It evaluates coordinated exchanges together: the intermediate 31-cell population may be worse even when reaching 30 is better. Direct swaps were often too distant.

A18 assigns all unfinished formation slots jointly, with constrained spare slots enforcing the chosen energy composition. This permits several short reassignment trips instead of a single long exchange. Completed formations stay locked. The change runs only in the first 12 turns, with a complete own-only packing plan, known clock and compatible energy rules. Every assigned trip is bounded by 24 Manhattan steps and remaining time; the existing router handles obstacles. This is a distance feasibility bound, not proof that every route succeeds.

No future sampled shapes, opponent private state, or source-specific identity enters the decision. No new LLM call or named-opponent memory is involved.

## Results

Each seed was played in both seats. Games used 16 rounds, 64 turns, 32 initial cells, a 64×64 board and 500 ms deadlines. The local two-player gym has no neutral hive golem.

| Fresh confirmation | Wins–losses–draws | Mean energy margin |
|---|---:|---:|
| A14 vs Baconian, seeds 7801–7820 | 14–23–3 | −2.375 |
| A18 vs Baconian, same seeds | 18–17–5 | −0.525 |
| A18 vs A14, seeds 7901–7920 | 25–15–0 | +3.050 |

On the matched Baconian boards, A18 improved its own energy by 2.775 and its margin by 1.85 per game. All 120 confirmation games had zero timeouts, errors or invalid commands; maximum observed worker turn time was 109.51 ms. A18 recorded 79 population reassignment batches against Baconian and 103 against A14. Counts measure interventions, not independently attributed successful rescues.

Selection used a separate eight-game exploratory screen, seeds 7701–7704: A14's mean margin was −11.125, A17's −3.75 and A18's −2.5. These screen results are not additional confirmation. Four earlier full traces, seeds 7603–7604, supplied the diagnosis.

**A18 is an improvement over our baseline, not demonstrated dominance over Baconian.** Baconian retains a small mean energy edge in the confirmation batch. Twenty independent board seeds are modest evidence, and live rules, opponents and timing can differ. Timing-bounded search can change trajectories across machines or loads.

The opponent is public main at `11198e34a68e93c4fa8b1a940d83557e3b354466`, not a verified copy of the source deployed live. [Baconian source](https://github.com/ebrinz/baconian-lattice-intimato/tree/11198e34a68e93c4fa8b1a940d83557e3b354466) · [Summaries](../results/population-summary.json) · [Per-game scorecards](../results/population-scorecards.json).

## Reproduce

After checking out the pinned Baconian repository beside this repository:

```sh
node evaluation/run.cjs --candidate population-global-a18 --opponent-module ../baconian-lattice-intimato/player.js --seeds 20 --start 7801 --output runs/a18-baconian.jsonl
node evaluation/run.cjs --candidate handoff-a14 --opponent-module ../baconian-lattice-intimato/player.js --seeds 20 --start 7801 --output runs/a14-baconian-control.jsonl
node evaluation/run.cjs --candidate population-global-a18 --opponent handoff-a14 --seeds 20 --start 7901 --output runs/a18-a14.jsonl
```

## Next counter to test

Reclassify A18's remaining losses before adding another mechanism. Separate unavoidable remainders, wrong spare membership, incomplete construction and final-move match theft. Where attack losses remain, exploit Baconian's published deadline policy: test threats that induce a predictable slide, then intercept the landing with spare cells. Treat that as an untested hypothesis; a counter must preserve our own scoring formations and outperform ordinary spare-cell raids on fresh boards.
