% The grounds of a formula, as rules a proof is built from.
%
% Facts arrive as given/1: the spec as its sheet was written, the chain the
% engine made of it — the first jackpot's outcomes and each state's — the
% figures the engine solved from that chain, and the figures the formula
% stores. Each rule/3 names a step of reasoning, what it concludes, and from
% what; prove/2 follows the rules and returns the proof — every step, every
% given it rests on, every sum worked — so the screen can say how a figure
% came to be.
%
% Nothing the engine solved is taken on its word where it can be checked:
% the chain is made again from the sheet and set against the engine's, and
% what each state yields is put into the state's own equation, which only
% the true solution satisfies once every state can end. What cannot be
% checked that way is said to be unchecked, and what holds but is guessed
% to be out of the ordinary is remarked on, as a guess.

:- dynamic(given/1).

% 1R トータル確率: spins paid for per round won — the regular game's, and
% those a combo plays at the heso.
rule(round_chance, round_chance(OneIn),
     ( \+ given(relief_drive(_, _)), \+ given(heso(_, _, _)), given(regular_one_in(P)), rounds_per_first_hit(R), OneIn is P / R )).
rule(round_chance_with_heso, round_chance(OneIn),
     ( \+ given(relief_drive(_, _)), given(heso(_, _, _)), given(regular_one_in(P)), heso_per_first_hit(H), rounds_per_first_hit(R),
       OneIn is (P + H) / R )).
rule(round_chance_with_relief_drive, round_chance(OneIn),
     ( given(relief_drive(_, _)), findall(Spins-Rounds, weighted_cycle(_, _, Spins, Rounds), Pairs),
       keys_of(Pairs, AllSpins), values_of(Pairs, AllRounds), sum_list(AllSpins, Spins), sum_list(AllRounds, Rounds),
       OneIn is Spins / Rounds )).

% A first jackpot's rounds: each share of its allotment, its own rounds and
% what the mode it leads to yields from there. A state's rounds are worked
% the same way from its own outcomes.
rule(rounds_per_first_hit, rounds_per_first_hit(R), rounds_from(first_hit, R)).
rule(rounds_from, rounds_from(From, R),
     ( findall(Part, allotted(From, Part), Parts), sum_list(Parts, R) )).
rule(allotted, allotted(From, Part),
     ( given(outcome(From, Share, Rounds, _, Target, _, _)), rounds_after(Target, After), Part is Share * (Rounds + After) )).
rule(back_to_regular, rounds_after(end, 0), true).
rule(into_mode, rounds_after(state(Index), After), given(state_rounds(Index, After))).

% Spins a combo plays at the heso — a CZ or a 潜確 shot there, said to be
% played without the 電サポ — paid for as regular spins are: a state's own,
% one for each spin reached until its jackpot or its last, and those of
% where it leads.
rule(heso_per_first_hit, heso_per_first_hit(H), heso_from(first_hit, H)).
rule(heso_from, heso_from(From, H),
     ( own_heso(From, Own), findall(Part, heso_part(From, Part), Parts), sum_list(Parts, After), H is Own + After )).
rule(heso_part, heso_part(From, Part), ( given(outcome(From, Share, _, _, Target, _, _)), heso_after(Target, After), Part is Share * After )).
rule(own_heso_none, own_heso(From, 0), \+ given(heso(From, _, _))).
rule(own_heso, own_heso(From, Own), ( given(heso(From, Spins, Hit)), Own is (1 - (1 - Hit) ** Spins) / Hit )).
rule(heso_back_to_regular, heso_after(end, 0), true).
rule(heso_into_mode, heso_after(state(Index), After), given(state_heso(Index, After))).

% The 遊タイム over the long run. Regular play starts again in one of a few
% ways — with the relief gauge empty, filled so far by a 時短 or a leftover
% queue, or with the 遊タイム spent until the next jackpot — each as often as
% the engine's long run says.
% A cycle from each is worked out here, and weighed by how often it comes.
rule(weighted_cycle, weighted_cycle(Kind, Weight, WeightedSpins, WeightedRounds),
     ( given(restart(Kind, Weight)), cycle_from(Kind, Spins, Rounds),
       WeightedSpins is Weight * Spins, WeightedRounds is Weight * Rounds )).
rule(cycle_filled, cycle_from(filled(Filled), Spins, Rounds),
     ( given(relief_drive(Full, Target)), given(regular_one_in(P)), Left is max(0, Full - Filled),
       Reach is (1 - 1 / P) ** Left, rounds_per_first_hit(R), rounds_after(Target, After),
       heso_per_first_hit(H), heso_after(Target, HesoAfter),
       Spins is (1 - Reach) * (P + H) + Reach * HesoAfter, Rounds is (1 - Reach) * R + Reach * After )).
rule(cycle_spent, cycle_from(spent, Spins, Rounds),
     ( given(regular_one_in(P)), rounds_per_first_hit(R), heso_per_first_hit(H), Spins is P + H, Rounds is R )).

% 1R 平均出玉: the spec's payout, less the balls that went in, or as measured.
% Where a share pays its rounds by a prize of its own, a round has no one
% payout: the figure is every round's gain over every round, over the long
% run, scaled by what a measured round is of the spec's. So too where a
% support gain changes the jackpots won on the 電サポ and not the first.
rule(payout_from_spec, payout_per_round(Balls),
     ( \+ given(own_payout), \+ given(support_gain(_)), \+ given(measured(_)), net_per_round(Balls) )).
rule(payout_measured, payout_per_round(Balls), ( \+ given(own_payout), \+ given(support_gain(_)), given(measured(Balls)) )).
rule(payout_by_share, payout_per_round(Balls),
     ( given(own_payout), balls_per_cycle(B), rounds_per_cycle(R), payout_scale(Scale), Balls is B * Scale / R )).
rule(payout_with_support_gain, payout_per_round(Balls),
     ( \+ given(own_payout), given(support_gain(_)), balls_per_cycle(B), rounds_per_cycle(R), payout_scale(Scale), Balls is B * Scale / R )).
rule(net_per_round, net_per_round(Net), ( given(payout(Prize, Count)), Net is Prize * Count - Count )).
rule(scale_as_spec, payout_scale(1), \+ given(measured(_))).
rule(scale_measured, payout_scale(Scale), ( given(measured(Balls)), net_per_round(Net), Net > 0, Scale is Balls / Net )).
rule(scale_unmeasurable, payout_scale(1), ( given(measured(_)), net_per_round(Net), Net =< 0 )).

rule(rounds_per_cycle, rounds_per_cycle(R), ( \+ given(relief_drive(_, _)), rounds_per_first_hit(R) )).
rule(rounds_per_cycle_with_relief_drive, rounds_per_cycle(R),
     ( given(relief_drive(_, _)), findall(Rounds, weighted_cycle(_, _, _, Rounds), All), sum_list(All, R) )).
rule(balls_per_cycle, balls_per_cycle(B), ( \+ given(relief_drive(_, _)), balls_per_first_hit(B) )).
rule(balls_per_cycle_with_relief_drive, balls_per_cycle(B),
     ( given(relief_drive(_, _)), findall(Balls, weighted_balls(_, _, Balls), All), sum_list(All, B) )).

% A first jackpot's balls: each share of its allotment, what its own rounds
% gain and what the mode it leads to gains from there; a state's likewise,
% its own rounds' gain changed by the support gain where the state is
% played on the 電サポ — never a first jackpot's, nor a state's played
% without it.
rule(balls_per_first_hit, balls_per_first_hit(B), balls_from(first_hit, B)).
rule(balls_from, balls_from(From, B),
     ( findall(Part, paid(From, Part), Parts), sum_list(Parts, B) )).
rule(paid, paid(From, Part),
     ( given(outcome(From, Share, _, Balls, Target, _, _)), gained(From, Balls, Gained), balls_after(Target, After), Part is Share * (Gained + After) )).
rule(gained_first_hit, gained(first_hit, Balls, Balls), true).
rule(gained_without_gain, gained(From, Balls, Balls), ( From \== first_hit, \+ given(support_gain(_)) )).
rule(gained_without_support, gained(From, Balls, Balls), ( given(support_gain(_)), given(without_support(From)) )).
rule(gained_on_support, gained(From, Balls, Gained),
     ( From \== first_hit, given(support_gain(Factor)), \+ given(without_support(From)), Gained is Balls * Factor )).
rule(balls_back_to_regular, balls_after(end, 0), true).
rule(balls_into_mode, balls_after(state(Index), After), given(state_balls(Index, After))).
rule(weighted_balls, weighted_balls(Kind, Weight, Weighted),
     ( given(restart(Kind, Weight)), cycle_balls(Kind, Balls), Weighted is Weight * Balls )).
rule(balls_filled, cycle_balls(filled(Filled), Balls),
     ( given(relief_drive(Full, Target)), given(regular_one_in(P)), Left is max(0, Full - Filled),
       Reach is (1 - 1 / P) ** Left, balls_per_first_hit(B), balls_after(Target, After),
       Balls is (1 - Reach) * B + Reach * After )).
rule(balls_spent, cycle_balls(spent, Balls), balls_per_first_hit(Balls)).

% The chain made again from the spec sheet. A mode reaches its next jackpot
% before it ends by its kind: an ST or a 時短 — at the regular game's chance
% or its own — or a leftover queue within its spins, a RUSH by its rate, a 確変 loop always. A jackpot there is allotted
% by the mode's shares; a mode with a lucky trigger counts its combo, and
% the jackpot that makes the trigger's moves play on.
rule(reach_special_time, reach(Mode, Chance),
     ( given(spec_mode(Mode, special_time(Spins, Hit))), Chance is 1 - (1 - Hit) ** Spins )).
rule(reach_rapid, reach(Mode, Chance),
     ( given(spec_mode(Mode, rapid(Spins))), \+ given(spec_early_end(Mode, _)), given(spec_regular(Hit)), Chance is 1 - (1 - Hit) ** Spins )).
rule(reach_rapid_at, reach(Mode, Chance),
     ( given(spec_mode(Mode, rapid_at(Spins, Hit))), \+ given(spec_early_end(Mode, _)), Chance is 1 - (1 - Hit) ** Spins )).

% A 時短 that may end early — a c時短 — races spin by spin: a jackpot at its
% chance, an early end at the c時短's, else on to the next spin. It wins
% before it ends either way as often as the race says; it ends early
% between two spins as often as each spin on the way is reached and ends
% there; and it runs out where it reaches its last spin and goes on past it.
rule(race_rapid, race(Mode, Hit, End, Spins),
     ( given(spec_mode(Mode, rapid(Spins))), given(spec_regular(Hit)), given(spec_early_end(Mode, End)) )).
rule(race_rapid_at, race(Mode, Hit, End, Spins),
     ( given(spec_mode(Mode, rapid_at(Spins, Hit))), given(spec_early_end(Mode, End)) )).
rule(reach_early_end, reach(Mode, Chance),
     ( race(Mode, Hit, End, Spins), Keep is 1 - Hit - End, Chance is Hit * (1 - Keep ** Spins) / (Hit + End) )).
rule(ended_between, ended_between(Mode, From, To, Chance),
     ( race(Mode, Hit, End, _), Keep is 1 - Hit - End, Chance is End * Keep ** (From - 1) * (1 - Keep ** (To - From + 1)) / (1 - Keep) )).
rule(ran_out_early_end, ran_out(Mode, Risk), ( race(Mode, Hit, End, Spins), Risk is (1 - Hit - End) ** Spins )).
rule(ran_out, ran_out(Mode, Risk), ( \+ given(spec_early_end(Mode, _)), reach(Mode, Reach), Risk is 1 - Reach )).

% The spins a 時短 ended early is taken to have ended at, step by step, as
% the engine gathers them so the long run with a 遊タイム stays small:
% steps of five spins below the 遊タイム's count, each filling the gauge by
% its middle spin, and every spin from the count on as one step filling it
% whole. Without a 遊タイム the spins are one step, filling by its middle.
rule(early_step_below, early_step(Mode, From, To, Fills),
     ( given(spec_relief_drive(Gauge, _)), race(Mode, _, _, Spins), Below is min(Spins, Gauge - 1), Last is (Below + 4) // 5 - 1,
       between(0, Last, Step), From is Step * 5 + 1, To is min(From + 4, Below), Fills is (From + To) // 2 )).
rule(early_step_rest, early_step(Mode, Gauge, Spins, Gauge),
     ( given(spec_relief_drive(Gauge, _)), race(Mode, _, _, Spins), Gauge =< Spins )).
rule(early_step_whole, early_step(Mode, 1, Spins, Fills),
     ( \+ given(spec_relief_drive(_, _)), race(Mode, _, _, Spins), Fills is (Spins + 1) // 2 )).
rule(reach_leftover_queue, reach(Mode, Chance),
     ( given(spec_mode(Mode, leftover_queue(Draws))), given(spec_regular(Hit)), Chance is 1 - (1 - Hit) ** Draws )).
rule(reach_rushing, reach(Mode, Chance), given(spec_mode(Mode, rushing(Chance)))).
rule(reach_until_hit, reach(Mode, 1), given(spec_mode(Mode, until_hit))).

rule(made_first_hit, made(first_hit, outcome(Share, Rounds, Balls, Target, Hits, 0)),
     ( given(spec_share(regular, Share, Rounds, Balls, Next, Hits)), enters(Next, Target) )).
rule(made_hit, made(Index, outcome(Chance, Rounds, Balls, Target, Hits, 0)),
     ( given(origin(Index, Mode, Combo)), reach(Mode, Reach), given(spec_share(mode(Mode), Share, Rounds, Balls, Next, Hits)),
       Chance is Reach * Share, lands(Mode, Combo, Next, Target) )).
rule(made_early_end, made(Index, outcome(Chance, 0, 0, Target, 0, Fills)),
     ( given(origin(Index, Mode, _)), early_step(Mode, From, To, Fills), given(spec_early_end_share(Mode, Share, Next)),
       ended_between(Mode, From, To, Ended), Chance is Ended * Share, enters(Next, Target) )).
rule(made_miss, made(Index, outcome(Risk, 0, 0, Target, 0, Fills)),
     ( given(origin(Index, Mode, _)), ran_out(Mode, Risk), Risk > 0, given(spec_on_miss(Mode, Next)), enters(Next, Target), made_fills(Index, Fills) )).
rule(enters_regular, enters(regular, end), true).
rule(enters_mode, enters(mode(Mode), state(Index)), given(origin(Index, Mode, 1))).
rule(leaves_mode, lands(Mode, _, Next, Target), ( Next \== mode(Mode), enters(Next, Target) )).
rule(repeats_mode, lands(Mode, _, mode(Mode), Target), ( \+ given(spec_lucky_trigger(Mode, _, _)), enters(mode(Mode), Target) )).
rule(adds_to_combo, lands(Mode, Combo, mode(Mode), state(Index)),
     ( given(spec_lucky_trigger(Mode, At, _)), Combo + 1 < At, Then is Combo + 1, given(origin(Index, Mode, Then)) )).
rule(lucky_trigger, lands(Mode, Combo, mode(Mode), Target),
     ( given(spec_lucky_trigger(Mode, At, To)), Combo + 1 >= At, enters(mode(To), Target) )).
% A state is shot at the heso, paying for its spins, where its mode is said
% to be played without the 電サポ and its spins run out: an ST at its own
% chance, a 時短 at the regular game's. A leftover queue's are held already.
rule(made_heso_special_time, made_heso(Index, Spins, Hit),
     ( given(origin(Index, Mode, _)), given(spec_without_support(Mode)), given(spec_mode(Mode, special_time(Spins, Hit))) )).
rule(made_heso_rapid, made_heso(Index, Spins, Hit),
     ( given(origin(Index, Mode, _)), given(spec_without_support(Mode)), given(spec_mode(Mode, rapid(Spins))), \+ given(spec_early_end(Mode, _)),
       given(spec_regular(Hit)) )).
rule(made_heso_early_end, made_heso(Index, Spins, Stop),
     ( given(origin(Index, Mode, _)), given(spec_without_support(Mode)), race(Mode, Hit, End, Spins), Stop is Hit + End )).
rule(made_heso_rapid_at, made_heso(Index, Spins, Hit),
     ( given(origin(Index, Mode, _)), given(spec_without_support(Mode)), given(spec_mode(Mode, rapid_at(Spins, Hit))),
       \+ given(spec_early_end(Mode, _)) )).
rule(made_fills_rapid, made_fills(Index, Spins), ( given(origin(Index, Mode, _)), given(spec_mode(Mode, rapid(Spins))) )).
rule(made_fills_rapid_at, made_fills(Index, Spins), ( given(origin(Index, Mode, _)), given(spec_mode(Mode, rapid_at(Spins, _))) )).
rule(made_fills_leftover_queue, made_fills(Index, Draws), ( given(origin(Index, Mode, _)), given(spec_mode(Mode, leftover_queue(Draws))) )).
rule(made_fills_none, made_fills(Index, 0),
     ( given(origin(Index, Mode, _)), \+ given(spec_mode(Mode, rapid(_))), \+ given(spec_mode(Mode, rapid_at(_, _))),
       \+ given(spec_mode(Mode, leftover_queue(_))) )).
% A state is played without the 電サポ where its mode is a leftover queue or
% says so, and on it otherwise.
rule(made_leftover_queue_without_support, made_support(Index, without), ( given(origin(Index, Mode, _)), given(spec_mode(Mode, leftover_queue(_))) )).
rule(made_said_without_support, made_support(Index, without),
     ( given(origin(Index, Mode, _)), \+ given(spec_mode(Mode, leftover_queue(_))), given(spec_without_support(Mode)) )).
rule(made_on_support, made_support(Index, on),
     ( given(origin(Index, Mode, _)), \+ given(spec_mode(Mode, leftover_queue(_))), \+ given(spec_without_support(Mode)) )).
rule(stored_without_support, stored_support(Index, without), given(without_support(Index))).
rule(stored_on_support, stored_support(Index, on), \+ given(without_support(Index))).

% The 遊タイム's long run, checked rather than believed. A point of a combo
% is a state, the spins filled toward the 遊タイム on the way out, and
% whether the 遊タイム's first run is still unbroken. A jackpot starts the
% count again; a miss adds the state's spins, never past the gauge; and a
% combo ends in regular play starting again with so many filled, or — out
% of an unbroken 遊タイム — with it spent. The engine gives each point's
% chance of each ending it can come to, and each must be its outcomes'
% shares of the chances where they lead. A miss fills the gauge by the
% spins its outcome says: its state's, or a 時短's ended early by its step's. From those, each way of starting leads to each
% other with a known chance, and a way's weight must be what flows into it
% from all of them. Every way leads by a jackpot to the ways a first
% jackpot ends in, so the weights that satisfy this and come to a whole
% are the only ones.
rule(jackpot_on, steps(_, state(Next), Hits, _, point(Next, 0, broken)), Hits > 0).
rule(jackpot_out, steps(_, end, Hits, _, restart(filled(0))), Hits > 0).
rule(miss_on, steps(point(_, Filled, Run), state(Next), 0, Fills, point(Next, More, Run)), filled_past(Filled, Fills, More)).
rule(miss_out_spent, steps(point(_, _, unbroken), end, 0, _, restart(spent)), true).
rule(miss_out, steps(point(_, Filled, broken), end, 0, Fills, restart(filled(More))), filled_past(Filled, Fills, More)).
rule(filled_past, filled_past(Filled, Fills, More),
     ( given(relief_drive(Full, _)), More is min(Full, Filled + Fills) )).
rule(ended, ends_in(restart(Kind), Kind, 1), true).
rule(ended_otherwise, ends_in(restart(Other), Kind, 0), Other \== Kind).
rule(ends_from_point, ends_in(point(State, Filled, Run), Kind, Chance),
     ( point_key(State, Filled, Run, Key), given(ending(Key, Kind, Chance)) )).
rule(ends_never, ends_in(point(State, Filled, Run), Kind, 0),
     ( point_key(State, Filled, Run, Key), given(point(Key, State, Filled, Run)), \+ given(ending(Key, Kind, _)) )).
rule(ending_part, ending_part(point(State, Filled, Run), Kind, Part),
     ( given(outcome(State, Share, _, _, Target, Hits, Fills)), steps(point(State, Filled, Run), Target, Hits, Fills, Landing),
       ends_in(Landing, Kind, Chance), Part is Share * Chance )).
rule(ending_weighed, ending_weighed(State, Filled, Run, Kind, Verdict),
     ( given(ending(Key, Kind, Engine)), given(point(Key, State, Filled, Run)), findall(Part, ending_part(point(State, Filled, Run), Kind, Part), Parts),
       sum_list(Parts, Mine), Gap is abs(Mine - Engine), verdict(Gap, 1.0e-9, Verdict) )).
rule(point_whole, point_whole(State, Filled, Run, Verdict),
     ( given(point(Key, State, Filled, Run)), findall(Chance, given(ending(Key, _, Chance)), Chances),
       sum_list(Chances, Sum), Gap is abs(Sum - 1), verdict(Gap, 1.0e-9, Verdict) )).
rule(arrives_in_state, arrives(state(State), Run, point(State, 0, Run)), true).
rule(arrives_at_end, arrives(end, broken, restart(filled(0))), true).
rule(arrives_at_end_spent, arrives(end, unbroken, restart(spent)), true).
rule(after_first_hit, after_first_hit(Kind, Chance),
     ( findall(Part, first_hit_part(Kind, Part), Parts), sum_list(Parts, Chance) )).
rule(first_hit_part, first_hit_part(Kind, Part),
     ( given(outcome(first_hit, Share, _, _, Target, _, _)), arrives(Target, broken, Landing), ends_in(Landing, Kind, Chance), Part is Share * Chance )).
rule(after_relief_drive, after_relief_drive(Kind, Chance),
     ( given(relief_drive(_, Target)), arrives(Target, unbroken, Landing), ends_in(Landing, Kind, Chance) )).
rule(leads_from_spent, leads(spent, Kind, Chance), after_first_hit(Kind, Chance)).
rule(leads_from_filled, leads(filled(Filled), Kind, Chance),
     ( given(relief_drive(Full, _)), given(regular_one_in(P)), Left is max(0, Full - Filled), Reach is (1 - 1 / P) ** Left,
       after_first_hit(Kind, Jackpot), after_relief_drive(Kind, Drive), Chance is (1 - Reach) * Jackpot + Reach * Drive )).
rule(flows_in, flows_in(Kind, Part), ( given(restart(From, Weight)), leads(From, Kind, Chance), Part is Weight * Chance )).

% Checks, each ending in a verdict rather than failing, so a disagreement
% is shown, not hidden: the chain as made here against the engine's, its
% shares against a whole, its states against ever ending, what the engine
% solved of each state against the state's own equation, the 遊タイム's long
% run against its own, a figure reasoned
% here against the engine's and against the one stored, and a sampled
% figure against the exact one, within twice its margin.
rule(check_made, made_check(From, Verdict),
     ( findall(Outcome, made(From, Outcome), Made),
       findall(outcome(Share, Rounds, Balls, Target, Hits, Fills), given(outcome(From, Share, Rounds, Balls, Target, Hits, Fills)), Stored),
       alike(Made, Stored, Verdict) )).
rule(check_regular, regular_check(Mine, Engine, Verdict),
     ( given(spec_regular(Hit)), Mine is 1 / Hit, given(regular_one_in(Engine)), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_relief_drive, relief_drive_check(Made, Stored, Verdict),
     ( findall(drive(Gauge, Target), made_relief_drive(Gauge, Target), Made),
       findall(drive(Gauge, Target), given(relief_drive(Gauge, Target)), Stored), same(Made, Stored, Verdict) )).
rule(made_relief_drive, made_relief_drive(Gauge, Target), ( given(spec_relief_drive(Gauge, To)), enters(mode(To), Target) )).
rule(check_shares, shares_check(From, Sum, Verdict),
     ( findall(Share, given(outcome(From, Share, _, _, _, _, _)), Shares), sum_list(Shares, Sum), Gap is abs(Sum - 1), verdict(Gap, 1.0e-9, Verdict) )).
rule(check_ends, ends_check(Stuck, Verdict), ( stuck_states(Stuck), length(Stuck, Count), verdict(Count, 0, Verdict) )).
rule(check_state_rounds, state_rounds_check(Index, Mine, Engine, Verdict),
     ( given(state_rounds(Index, Engine)), rounds_from(Index, Mine), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_state_balls, state_balls_check(Index, Mine, Engine, Verdict),
     ( given(state_balls(Index, Engine)), balls_from(Index, Mine), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_state_heso, state_heso_check(Index, Mine, Engine, Verdict),
     ( given(state_heso(Index, Engine)), heso_from(Index, Mine), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_heso, heso_check(Index, Made, Stored, Verdict),
     ( findall(Spins-Hit, made_heso(Index, Spins, Hit), Made), findall(Spins-Hit, given(heso(Index, Spins, Hit)), Stored),
       heso_alike(Made, Stored, Verdict) )).
rule(check_support, support_check(Index, Made, Stored, Verdict),
     ( made_support(Index, Made), stored_support(Index, Stored), same(Made, Stored, Verdict) )).
rule(check_fills, fills_check(Index, Mine, Engine, Verdict),
     ( given(fills(Index, Engine)), made_fills(Index, Mine), Gap is abs(Mine - Engine), verdict(Gap, 0, Verdict) )).
rule(check_endings, endings_check(Count, Wrong, Verdict),
     ( quietly(findall(Each, ending_weighed(_, _, _, _, Each), All)), length(All, Count), failures(All, Wrong), verdict(Wrong, 0, Verdict) )).
rule(check_points, points_check(Count, Wrong, Verdict),
     ( quietly(findall(Each, point_whole(_, _, _, Each), All)), length(All, Count), failures(All, Wrong), verdict(Wrong, 0, Verdict) )).
rule(check_weight, weight_check(Kind, Mine, Engine, Verdict),
     ( given(restart(Kind, Engine)), quietly(findall(Part, flows_in(Kind, Part), Parts)), sum_list(Parts, Mine),
       Gap is abs(Mine - Engine), verdict(Gap, 1.0e-9, Verdict) )).
rule(check_weights, weights_check(Sum, Verdict),
     ( findall(Weight, given(restart(_, Weight)), Weights), sum_list(Weights, Sum), Gap is abs(Sum - 1), verdict(Gap, 1.0e-9, Verdict) )).
rule(check_engine, engine_check(Figure, Mine, Engine, Verdict),
     ( given(engine(Figure, Engine)), Gap is abs(Mine - Engine), Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_stored, stored_check(Figure, Mine, Stored, Verdict),
     ( given(stored(Figure, Stored)), Gap is abs(Mine - Stored), Limit is 1.0e-9 * max(1, abs(Stored)), verdict(Gap, Limit, Verdict) )).
rule(check_sample, sample_check(Exact, Sampled, Margin, Verdict),
     ( given(sampled(Sampled, Margin)), Gap is abs(Exact - Sampled), Limit is 2 * Margin, verdict(Gap, Limit, Verdict) )).
rule(within, verdict(Gap, Limit, holds), Gap =< Limit).
rule(beyond, verdict(Gap, Limit, fails), Gap > Limit).

% What is not checked here, said rather than passed over: a margin so wide
% that a sampled figure could be almost anything checks nothing.
rule(unverified_wide_margin, remark(wide_margin(Sampled, Margin)), ( given(sampled(Sampled, Margin)), 2 * Margin > 0.05 * Sampled )).

% What holds, but is guessed to be out of the ordinary. A share nobody is
% allotted is one the engine refuses to make a chain with, so a chain that
% has one was not made by it. The other two are guesses at what to doubt,
% not knowledge of machines: a round that gains nothing, and a 遊タイム
% reached more often than a jackpot. What is known is only that none of
% the catalog's 508 pachinko formulas, 48 of them with a 遊タイム, showed
% either on 2026-10-13. A third guess — more than a round to a regular
% spin — was wrong and is gone: seven of those formulas showed it, their
% regular game hitting once in 9.9 to 39.9 spins and a first jackpot
% running to between thirty-nine and fifty-two rounds.
rule(odd_empty_share, remark(empty_share(From)), ( given(outcome(From, Share, _, _, _, _, _)), Share =< 0 )).
rule(odd_no_gain, remark(no_gain(Net)), ( net_per_round(Net), Net =< 0 )).
rule(odd_relief_drive_likely, remark(relief_drive_likely(Reach)),
     ( given(relief_drive(Full, _)), given(regular_one_in(P)), Reach is (1 - 1 / P) ** Full, Reach > 0.5 )).

% The grounds: the two figures and their checks, then what they rest on —
% the engine's solution, the chain it solved, the chain as the sheet makes
% it — and the remarks. Each part is attempted on its own, so one that
% cannot be proved is shown as unproved beside the others.
rule(grounds, grounds,
     ( attempt(figure(round_chance, _)), attempt(figure(payout_per_round, _)),
       attempt(solution), attempt(chain), attempt(made), attempt(remarks) )).
rule(round_chance_grounds, figure(round_chance, OneIn),
     ( round_chance(OneIn), engine_check(round_chance, OneIn, _, _),
       ( given(sampled(_, _)) -> sample_check(OneIn, _, _, _) ; stored_check(round_chance, OneIn, _, _) ) )).
rule(payout_grounds, figure(payout_per_round, Balls),
     ( payout_per_round(Balls), engine_check(payout_per_round, Balls, _, _), stored_check(payout_per_round, Balls, _, _) )).
rule(solution, solution,
     ( findall(Index, state_solved(Index), _), ( given(relief_drive(_, _)) -> long_run ; true ) )).
rule(long_run, long_run, ( endings_check(_, _, _), points_check(_, _, _), weights_check(_, _), findall(Kind, weight_solved(Kind), _) )).
rule(weight_solved, weight_solved(Kind), ( given(restart(Kind, _)), weight_check(Kind, _, _, _) )).
rule(state_solved, state_solved(Index),
     ( given(state(Index)), state_rounds_check(Index, _, _, _),
       ( balls_vary -> state_balls_check(Index, _, _, _) ; true ),
       ( given(heso(_, _, _)) -> state_heso_check(Index, _, _, _) ; true ) )).
rule(balls_vary_by_share, balls_vary, given(own_payout)).
rule(balls_vary_by_support, balls_vary, ( \+ given(own_payout), given(support_gain(_)) )).
rule(chain, chain,
     ( shares_check(first_hit, _, _), findall(Index, state_whole(Index), _), ends_check(_, _) )).
rule(state_whole, state_whole(Index), ( given(state(Index)), shares_check(Index, _, _) )).
rule(made, made,
     ( regular_check(_, _, _), made_check(first_hit, _), findall(Index, state_made(Index), _), relief_drive_check(_, _, _) )).
rule(state_made, state_made(Index),
     ( given(state(Index)), made_check(Index, _), ( given(relief_drive(_, _)) -> fills_check(Index, _, _, _) ; true ),
       ( given(support_gain(_)) -> support_check(Index, _, _, _) ; true ),
       ( given(spec_without_support(_)) -> heso_check(Index, _, _, _) ; true ) )).
rule(remarks, remarks, findall(Remark, remark(Remark), _)).

% prove(Goal, Proof): Goal holds, and Proof says why.
prove(given(Fact), given(Fact)) :- !, given(Fact).
prove(X is Expression, computed(X, Expression)) :- !, X is Expression.
prove(sum_list(Parts, Sum), computed(Sum, sum(Parts))) :- !, sum_list(Parts, Sum).
prove(findall(Template, Goal, Found), collected(Proofs)) :- !,
    findall(Template-Proof, prove(Goal, Proof), Pairs), keys_of(Pairs, Found), values_of(Pairs, Proofs).
prove(\+ Goal, absent(Goal)) :- !, \+ prove(Goal, _).
prove((If -> Then ; Else), Proof) :- !, ( prove(If, _) -> prove(Then, Proof) ; prove(Else, Proof) ).
prove(attempt(Goal), Proof) :- !, ( catch(prove(Goal, Found), _, fail) -> Proof = Found ; Proof = unproved(Goal) ).
prove(true, done) :- !.
prove(quietly(Goal), done) :- !, holds(Goal).
prove(Goal, checked(Goal)) :- compared(Goal), !, call(Goal).
prove(Goal, done) :- worked(Goal), !, call(Goal).
prove(Goal, step(Name, Goal, Premises)) :- rule(Name, Goal, Body), prove_all(Body, Premises).

prove_all((First, Rest), [Proof|Proofs]) :- !, prove(First, Proof), prove_all(Rest, Proofs).
prove_all(Goal, [Proof]) :- prove(Goal, Proof).

% holds(Goal): Goal holds by the same rules, without the proof kept. Where a
% check runs to thousands — every point of a long run against each way of
% starting again — its verdicts are what is said of it, and the steps under
% each are not kept to be said.
holds(given(Fact)) :- !, given(Fact).
holds(X is Expression) :- !, X is Expression.
holds(sum_list(Parts, Sum)) :- !, sum_list(Parts, Sum).
holds(findall(Template, Goal, Found)) :- !, findall(Template, holds(Goal), Found).
holds(\+ Goal) :- !, \+ holds(Goal).
holds((If -> Then ; Else)) :- !, ( holds(If) -> holds(Then) ; holds(Else) ).
holds((First, Rest)) :- !, holds(First), holds(Rest).
holds(quietly(Goal)) :- !, holds(Goal).
holds(true) :- !.
holds(Goal) :- compared(Goal), !, call(Goal).
holds(Goal) :- worked(Goal), !, call(Goal).
holds(Goal) :- rule(_, Goal, Body), holds(Body).

% Comparisons, checked as they stand; and what is worked outside the proof.
compared(_ > _).
compared(_ < _).
compared(_ =< _).
compared(_ >= _).
compared(_ \== _).
worked(keys_of(_, _)).
worked(values_of(_, _)).
worked(length(_, _)).
worked(alike(_, _, _)).
worked(same(_, _, _)).
worked(stuck_states(_)).
worked(failures(_, _)).
worked(heso_alike(_, _, _)).
worked(between(_, _, _)).
worked(point_key(_, _, _, _)).

% The heso spins a state is made with and the ones it is stored with alike:
% none either way, or one each, the same spins at a chance apart by no more
% than rounding.
heso_alike([], [], holds) :- !.
heso_alike([Spins-Made], [Spins-Stored], holds) :- abs(Made - Stored) =< 1.0e-9, !.
heso_alike(_, _, fails).

% The number a point of a combo is looked up by, as the facts give it: its
% state, whether the 遊タイム's first run is unbroken, and the spins filled.
point_key(State, Filled, Run, Key) :- ( Run == unbroken -> Unbroken = 1 ; Unbroken = 0 ), Key is (State * 2 + Unbroken) * 100000 + Filled.

keys_of([], []).
keys_of([Key-_|Pairs], [Key|Keys]) :- keys_of(Pairs, Keys).
values_of([], []).
values_of([_-Value|Pairs], [Value|Values]) :- values_of(Pairs, Values).

% Two lists of outcomes alike: the same rounds, balls, target, jackpots and
% spins filled each, and chances apart by no more than rounding.
alike(Made, Stored, Verdict) :- ( alike_each(Made, Stored) -> Verdict = holds ; Verdict = fails ).
alike_each([], []).
alike_each([outcome(P, Rounds, Balls, Target, Hits, Fills)|Made], [outcome(Q, Rounds2, Balls2, Target2, Hits2, Fills2)|Stored]) :-
    abs(P - Q) =< 1.0e-9, Rounds =:= Rounds2, Balls =:= Balls2, Target == Target2, Hits =:= Hits2, Fills =:= Fills2, alike_each(Made, Stored).
same(Made, Stored, Verdict) :- ( Made == Stored -> Verdict = holds ; Verdict = fails ).
failures(Verdicts, Wrong) :- findall(fails, member(fails, Verdicts), Failed), length(Failed, Wrong).

% The states no run of outcomes leads out of: the states that end at once
% are known to end, then every state an outcome leads from into those, and
% so on until none is added. What is left never ends.
stuck_states(Stuck) :-
    findall(Index, given(state(Index)), All), ending(All, [], Ending),
    findall(Index, ( member(Index, All), \+ member(Index, Ending) ), Stuck).
ending(All, Known, Ending) :-
    findall(Index, ( member(Index, All), \+ member(Index, Known), leaves(Index, Known) ), New),
    ( New == [] -> Ending = Known ; append(New, Known, Wider), ending(All, Wider, Ending) ).
leaves(Index, Known) :-
    given(outcome(Index, Share, _, _, Target, _, _)), Share > 0, ( Target == end ; Target = state(Next), member(Next, Known) ), !.
