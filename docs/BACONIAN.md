# What Baconian did differently

Source review, September 25, 2026. Reviewed public `main` at [11198e34a68e93c4fa8b1a940d83557e3b354466](https://github.com/ebrinz/baconian-lattice-intimato/tree/11198e34a68e93c4fa8b1a940d83557e3b354466). That commit postdates our last saved leaderboard. We have not established the exact deployed commit for every game. Their experiment figures below are author-reported, not independently rerun ablations.

Our last saved leaderboard has Baconian first in **Clash**, with 29 wins, and second in **Arena**, with 63. Xcellect led Arena with 65. That distinction matters when explaining “how Baconian won.” An overall hackathon award is a separate result we have not verified here.

## 1. Construction became reliable before the clever parts paid off

Their planner builds own formations, minimizes the longest assignment distance before the total, improves assignments across formations, and tries an isolated-unit-first construction when cheap local groups strand distant cells. The router checks whether occupying a slot would cut off access to remaining slots. A gateway reassignment exchanges destinations before a unit seals the entrance. Repeated collision deadlocks trigger escape moves.

This overlaps directly with our late-game failures: an own P5 could remain one cell short while an incoming cell oscillated beside it. We built a narrow two-turn enclosed-vacancy repair; their approach also changes the assignment that creates the obstruction. This is a promising architectural difference, not proof it fixes every recorded position. [Planner](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/baconian/planner.js), [router](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/baconian/router.js), [gateway logic](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/player.js#L473).

## 2. They developed a sequence of attacks and counters

The greedy matcher scans in a fixed order and ignores ownership. A foreign formation can claim a cell that our own complete shape needs. Baconian exploited this in both directions:

1. Move a threatened whole formation on the final turn.
2. Park leftover attackers near an earlier overlapping shape and complete it on the final turn.
3. Defend against nearby attackers even before their strike is present.
4. Stage attackers two steps away, then approach on the penultimate turn to evade stillness-based detection.
5. Remove the stillness requirement: at the final decision, any foreign cell able to reach a strike square is relevant.
6. When every landing is reachable, sometimes choose a less exposed escape rather than freeze.

The main code enables the shadow step, second-generation foresight, and the last fallback. Their strategy log reports that foresight against v3 changed the outcome from 20 wins in 40 to 39; later foresight against v5 again reached 39 in 40. Those are their internal comparisons, not our live record. The significant idea is to model the opponent's **reachable action at the deadline**, rather than equate long stillness with a promise to stay. [Decision and dodge code](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/player.js), [strategy history](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/STRATEGY.md).

## 3. They optimized the number of cells left for later rounds

Their `weakLeftoversWanted` minimizes expected population remainders over the shape catalogue. `balanceLeftovers` then changes assignments so an appropriate number of energy-1 cells remain outside formations. It can save a weak cell or let one die. Preserving the largest population is not automatically the highest-energy policy.

For the default catalogue, the expected remainder is approximately 1.18 for 32 cells, 1.82 for 31, and 0.82 for 30. A single death can make future packing worse; two can make it better. Their log reports +3.5 Arena margin against v6 and +4.5 Clash margin in the corresponding arithmetic experiment.

Our A14 independently reached the same underlying question using a finite-horizon ideal-packing dynamic program. But it only acts through short healthy-donor/critical-spare handoffs after all possible own formations are already complete. Baconian incorporates both directions of population choice into initial assignment. Our richer value estimate therefore has fewer opportunities to affect behavior. The next comparison should hold the assignment mechanism fixed and vary the value rule; comparing the two entire bots cannot isolate this effect. [Arithmetic implementation](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/baconian/planner.js#L83), [experiment log](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/EXPERIMENTS.md).

## 4. They discarded mechanisms without opportunities to act

Binding opponents' escape routes required nearby spare cells; it rarely found them and was disabled. Recruiters, stronger culling, and the probabilistic Oracle are also disabled in the reviewed defaults. This resembles our support-insurance result: a successful synthetic tactic, but no usable deadline replacement sets in the 40-game qualification.

The names are colorful, but the final controller is conventional JavaScript search, rules, and arithmetic. There is no LLM in the reviewed strategy loop. Four named roles do not establish four independent minds: one controller sees and commands all its own cells. [Enabled settings](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/baconian/tuning.js).

## 5. Communication is concrete and checked

The late `Diplomat` code parses another bot's `SafeHouse` messages naming shape vacancies. It checks reachability, verifies the proposed board with the matcher, protects existing formations, and requires an acceptable ratio of own cells helped to foreign cells helped. The current shape is filtered before considering offers. Anonymous text supplies a candidate; board consequences determine acceptance.

This is a better communication experiment for us than asking a model for generic advice. Compare identical boards with a valid offer, silence, stale coordinates, and a malicious offer. Measure accepted deals, cells saved, and regret against a no-message policy. Their repository establishes implementation and unit tests, not live causal benefit from these messages. [Offer parsing and validation](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/baconian/stragglers.js#L313).

## 6. Their deployment was part of the result

They deployed one Railway replica with an always-restart policy, then separated the development branch from the live branch. Our bot suffered local process interruptions and only acquired launchd supervision late. Neither setup proves perfect uptime, but their service did not depend on a laptop remaining awake. Leaderboard wins accumulate over time, so availability changes the number and quality of opportunities to win. [Deployment](https://github.com/ebrinz/baconian-lattice-intimato/blob/11198e34a68e93c4fa8b1a940d83557e3b354466/railway.json).

## What to take forward

Prioritize formation completion and assignment flexibility, then test population arithmetic at assignment time. Use the actual published opponent as an additional benchmark; our Baconian stand-in was too limited to establish an edge over the real bot. Retain controlled ablations, frozen source hashes, per-turn traces, and a separately recorded real-time deadline check. The two teams independently encountered timing-induced variation and the difference between a working tactical example and a stronger full-game policy.

## Fresh fast-gym comparison

After the initial eight-game screen, we ran ten fresh seeds (7601–7610), both seats, full16-round/64-turn games and500ms deadlines, two games concurrently. **A14:8 wins,12 losses;43.7 mean energy versus45.9;27.7 survivors versus29.3.** Four paired seeds favored A14 and six favored Baconian. There were no host errors, invalid commands or timeouts; maximum decision103.41ms.

This is an accelerated two-player comparison without the neutral hive golem. It uses pinned published main11198e3, not a verified live branch, and time-bounded searches may vary under load. It supports a modest Baconian advantage in this sample, not a universal ranking or a diagnosis of which feature causes it. [Summary](../results/baconian-fast-7601.json), [all20 scorecards](../results/baconian-fast-7601-scorecards.json). The README includes the command for rerunning this opponent locally.
