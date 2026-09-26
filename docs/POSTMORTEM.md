# Gettyggy: what survived the Lattice Animals hackathon

September 25, 2026. We built a competitive controller, finished behind the leading bots, and preserved enough evidence to explain several failure mechanisms. Our biggest late opportunities were ordinary construction and population management. More elaborate advice and support-insurance systems did not show an advantage in the comparisons we ran.

## The result we can substantiate

The last spectator snapshot is **19:37:25 PDT**. The site subsequently failed DNS resolution from both the browser and an independent command-line check, so we could not fetch an official final export. These are last-observed standings, not a claim about later games or the overall award.

| Arena | Wins | Clash | Wins |
|---|---:|---|---:|
| xcellect — first | 65 | baconian_lattice_intimator — first | 29 |
| baconian_lattice_intimator — second | 63 | saelra — second | 10 |
| saelra — third | 62 | gettyggy — third | 8 |
| gettyggy — tied fourth | 59 | toni — fourth | 4 |
| tyggy — tied fourth | 59 | xcellect / junior — tied fifth | 3 |

Our local finish records contain **102 Arena games, 59 wins and 43 losses**, plus **51 Clash games, 8 wins**. The win counts agree with the last captured leaderboard. This is not an uptime-adjusted ranking: participation duration, matchmaking, disconnected opponents and changing releases affect the counts. [Standings](../results/last-standings.json), [live results and flags](../results/live-results.json).

| Opponent | All locally recorded Arena wins–losses | After excluding our flagged interrupted/mixed games and known opponent impairment |
|---|---:|---:|
| saelra | 9–14 | 9–11 |
| Baconian | 2–5 | 1–4 |
| xcellect | 2–7 | 2–6 |
| junior | 17–8 | 10–7 |
| tyggy | 14–9 | 10–6 |

The second column after filtering is still not a controlled comparison: a healthy local record does not verify that the opponent played continuously. These tables span multiple strategy versions. They must not be labeled A14's win rate.

## What improved

**Deadline movement mattered.** The matcher can allocate a cell to an earlier overlapping shape even when our own shape is complete. In a small A6 ablation against A4, preservation without final movement lost all four games; movement alone and the combined policy each won all four. That rejects the idea that simply holding completed shapes is sufficient. It does not establish that every component of the combined policy helped independently.

**Own-first construction earned a deployment.** A8 beat A6 25–15 on 20 fresh seeds with both seats, improving mean final energy by 2.55. Its Clash results were mixed, so it was an Arena-focused improvement rather than a universal successor.

**Narrow repairs can help, but need full-game qualification.** A13's enclosed-vacancy repair completed five repairs in its qualification and beat A11 21–19 with +0.525 energy/game. An earlier routing repair worked in a recorded fixture and failed to improve the whole policy. A successful demonstration was not a promotion criterion on its own.

**Selective handoffs helped locally.** A14 compared ideal future packing with and without moving a healthy matched cell out for a critical spare. It beat A13 26–14, +3.025 energy/game, with 15 completed handoffs in the 40-game batch. That is the final deployed bundle. Its value model ignores future spatial and adversarial constraints, so the estimate is a heuristic. [Qualification summaries](../results/selective-handoff.json), [scorecards](../results/a14-qualification-5801-scorecards.json).

## What did not earn deployment

**Support insurance:** A15b staged replacements near foreign supports and checked all 25 combinations of two supports staying or moving. It passed the constructed engine test. In 40 games against A14 it scored 18–18–4 with zero energy margin: 60 staging attempts, 60 cancellations, and no eligible deadline replacement sets. The missing resource was a nearby spare, not a better verbal explanation of the tactic. It remains an explicitly rejected candidate. The first A15 attempt also exposed a method-name collision with inherited handoff code; it failed locally and never went live. [Results](../results/support-insurance.json).

**Jev advice:** in the controlled eight-game paired comparison, all 63 model replies chose own-only construction and the accepted commands and board trajectories matched the fixed selector exactly. An earlier apparent advantage disappeared when timing-induced changes in the opponents' search were removed. The asynchronous integration worked; the decision set did not demonstrate useful model judgment.

**Opponent memory:** the final small screen gave within-game and recent-history policies the same modest outcomes. It did not establish extra value from cross-game memory and was not promoted. Recorded behavior should be separated from inferred identity; anonymous Clash cells cannot be assigned to named opponents just because they share a color or message.

## Three failures worth keeping as regression cases

1. **Foreign stillness is not a commitment.** In an xcellect replay, a support stayed at the same coordinate throughout the observed round and left on the final action. Four of our cells missed the match; two died. Increasing a stillness threshold would not solve that example.
2. **Our own assignment can block a reachable formation.** In saelra game `2ab0cc57`, a P5 stayed incomplete while a cell oscillated nearby. All 64 recorded commands reproduced. In a conditional engine continuation with foreign cells held still, two coordinated moves increased own matches from 23 to 28. The existing gate repair excluded this geometry. This is a verified tactical opportunity, not a reconstructed alternative whole-game win.
3. **Saving a cell is not always saving energy.** A larger population can have worse remainders for later shape sizes. The rejected A12 survival policy increased survivors but lowered energy; A14 used a value estimate to restrict exchanges. Baconian independently incorporated population arithmetic directly into assignment.

The final saelra loss was **41–44, 30 survivors each**. A14's round-11 handoff is verified: critical cell 14 entered healthy donor 22's slot and survived; donor 22 lost one energy. The game crossed a client interruption, so the final score does not isolate the strategy's effect.

## Availability and evaluation were part of the outcome

Our client had an abrupt local process disappearance and interrupted games. Moving it to launchd at 19:16 made it independent of the coding session during that Mac login, but it still depended on the Mac staying awake. We also excluded a 37–0 victory over tyggy from strategic claims after verifying impaired opponent participation. During the DNS outage, the gettyggy service was stopped rather than left retrying. After the server returned, A14 was restarted at 20:47 PDT. This recap retains the earlier 19:37 capture as its explicit cutoff; resumed play is a new observation period.

We repeatedly beat a champion **stand-in** without establishing superiority over the real competitor. After the event, an eight-game screen against Baconian's actual published `main` produced **2 wins, 6 losses, −2.75 mean energy margin**, with no host faults. That small screen has no neutral golem and the published commit is not a verified match to the live deployment. It establishes a useful testable opponent, not a new definitive ranking. [Screen summary](../results/baconian-screen.json), [source review](BACONIAN.md).

Frozen code, input hashes, full-length games, seat swaps, source manifests and per-turn logs made these distinctions possible. What remained weak was external validity: few opponents captured the live failure modes, and our late repairs often acted too rarely to change a match. A larger test count against an inadequate stand-in would not solve that.

## The next experiment, if we return

1. Extend assignment and routing to the verified P5 case. Require preserved matches, replay agreement before intervention, and full-game comparisons against actual published opponents.
2. Compare population choice at assignment time with A14's late handoff. Hold the value rule and geometry separately constant to identify which ingredient matters.
3. Test concrete communication: valid shape-completion offers versus silence, stale offers and deceptive offers. Judge board consequences. Add Jev only if it has distinct choices that deterministic rules cannot already resolve.
4. Deploy on an always-on host before collecting a new competitive series. Track both contestants' participation where possible, and log the exact live release independently from development.

For About Blank, the transferable result is methodological: test whether an induced policy changes decisions and outcomes, not merely its narration. This game provides executable examples of coordination and adaptation; it does not establish contemplative states or model consciousness.

## Preservation

The private local archive contains **188 parseable replay snapshots**: 161 finished Arena, four finished Clash, two partial Arena and 21 partial Clash. The 15.96 GB source capture yielded a preserved allowlist of incoming arena/game-chunk messages; outgoing authentication and browser session state were excluded. We also saved our frozen strategies, audits, traces and evaluation artifacts with checksums. The public repository contains the smaller reviewable code/results package, not that raw archive.
