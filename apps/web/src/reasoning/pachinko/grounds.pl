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

% 1R トータル確率: regular-game spins per round won.
rule(round_chance, round_chance(OneIn),
     ( \+ given(relief_drive(_, _)), given(regular_one_in(P)), rounds_per_first_hit(R), OneIn is P / R )).
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
     ( given(outcome(From, Share, Rounds, _, Target, _)), rounds_after(Target, After), Part is Share * (Rounds + After) )).
rule(back_to_regular, rounds_after(end, 0), true).
rule(into_mode, rounds_after(state(Index), After), given(state_rounds(Index, After))).

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
       Spins is (1 - Reach) * P, Rounds is (1 - Reach) * R + Reach * After )).
rule(cycle_spent, cycle_from(spent, Spins, Rounds),
     ( given(regular_one_in(P)), rounds_per_first_hit(R), Spins is P, Rounds is R )).

% 1R 平均出玉: the spec's payout, less the balls that went in, or as measured.
% Where a share pays its rounds by a prize of its own, a round has no one
% payout: the figure is every round's gain over every round, over the long
% run, scaled by what a measured round is of the spec's.
rule(payout_from_spec, payout_per_round(Balls),
     ( \+ given(own_payout), \+ given(measured(_)), net_per_round(Balls) )).
rule(payout_measured, payout_per_round(Balls), ( \+ given(own_payout), given(measured(Balls)) )).
rule(payout_by_share, payout_per_round(Balls),
     ( given(own_payout), balls_per_cycle(B), rounds_per_cycle(R), payout_scale(Scale), Balls is B * Scale / R )).
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
% gain and what the mode it leads to gains from there; a state's likewise.
rule(balls_per_first_hit, balls_per_first_hit(B), balls_from(first_hit, B)).
rule(balls_from, balls_from(From, B),
     ( findall(Part, paid(From, Part), Parts), sum_list(Parts, B) )).
rule(paid, paid(From, Part),
     ( given(outcome(From, Share, _, Balls, Target, _)), balls_after(Target, After), Part is Share * (Balls + After) )).
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
% before it ends by its kind: an ST or a 時短 or a leftover queue within its
% spins, a RUSH by its rate, a 確変 loop always. A jackpot there is allotted
% by the mode's shares; a mode with a lucky trigger counts its combo, and
% the jackpot that makes the trigger's moves play on.
rule(reach_special_time, reach(Mode, Chance),
     ( given(spec_mode(Mode, special_time(Spins, Hit))), Chance is 1 - (1 - Hit) ** Spins )).
rule(reach_rapid, reach(Mode, Chance),
     ( given(spec_mode(Mode, rapid(Spins))), given(spec_regular(Hit)), Chance is 1 - (1 - Hit) ** Spins )).
rule(reach_leftover_queue, reach(Mode, Chance),
     ( given(spec_mode(Mode, leftover_queue(Draws))), given(spec_regular(Hit)), Chance is 1 - (1 - Hit) ** Draws )).
rule(reach_rushing, reach(Mode, Chance), given(spec_mode(Mode, rushing(Chance)))).
rule(reach_until_hit, reach(Mode, 1), given(spec_mode(Mode, until_hit))).

rule(made_first_hit, made(first_hit, outcome(Share, Rounds, Balls, Target, Hits)),
     ( given(spec_share(regular, Share, Rounds, Balls, Next, Hits)), enters(Next, Target) )).
rule(made_hit, made(Index, outcome(Chance, Rounds, Balls, Target, Hits)),
     ( given(origin(Index, Mode, Combo)), reach(Mode, Reach), given(spec_share(mode(Mode), Share, Rounds, Balls, Next, Hits)),
       Chance is Reach * Share, lands(Mode, Combo, Next, Target) )).
rule(made_miss, made(Index, outcome(Risk, 0, 0, Target, 0)),
     ( given(origin(Index, Mode, _)), reach(Mode, Reach), Risk is 1 - Reach, Risk > 0, given(spec_on_miss(Mode, Next)), enters(Next, Target) )).
rule(enters_regular, enters(regular, end), true).
rule(enters_mode, enters(mode(Mode), state(Index)), given(origin(Index, Mode, 1))).
rule(leaves_mode, lands(Mode, _, Next, Target), ( Next \== mode(Mode), enters(Next, Target) )).
rule(repeats_mode, lands(Mode, _, mode(Mode), Target), ( \+ given(spec_lucky_trigger(Mode, _, _)), enters(mode(Mode), Target) )).
rule(adds_to_combo, lands(Mode, Combo, mode(Mode), state(Index)),
     ( given(spec_lucky_trigger(Mode, At, _)), Combo + 1 < At, Then is Combo + 1, given(origin(Index, Mode, Then)) )).
rule(lucky_trigger, lands(Mode, Combo, mode(Mode), Target),
     ( given(spec_lucky_trigger(Mode, At, To)), Combo + 1 >= At, enters(mode(To), Target) )).
rule(made_fills_rapid, made_fills(Index, Spins), ( given(origin(Index, Mode, _)), given(spec_mode(Mode, rapid(Spins))) )).
rule(made_fills_leftover_queue, made_fills(Index, Draws), ( given(origin(Index, Mode, _)), given(spec_mode(Mode, leftover_queue(Draws))) )).
rule(made_fills_none, made_fills(Index, 0),
     ( given(origin(Index, Mode, _)), \+ given(spec_mode(Mode, rapid(_))), \+ given(spec_mode(Mode, leftover_queue(_))) )).

% The 遊タイム's long run, checked rather than believed. A point of a combo
% is a state, the spins filled toward the 遊タイム on the way out, and
% whether the 遊タイム's first run is still unbroken. A jackpot starts the
% count again; a miss adds the state's spins, never past the gauge; and a
% combo ends in regular play starting again with so many filled, or — out
% of an unbroken 遊タイム — with it spent. The engine gives each point's
% chance of each ending it can come to, and each must be its outcomes'
% shares of the chances where they lead. From those, each way of starting leads to each
% other with a known chance, and a way's weight must be what flows into it
% from all of them. Every way leads by a jackpot to the ways a first
% jackpot ends in, so the weights that satisfy this and come to a whole
% are the only ones.
rule(jackpot_on, steps(_, state(Next), Hits, point(Next, 0, broken)), Hits > 0).
rule(jackpot_out, steps(_, end, Hits, restart(filled(0))), Hits > 0).
rule(miss_on, steps(point(State, Filled, Run), state(Next), 0, point(Next, More, Run)), filled_past(State, Filled, More)).
rule(miss_out_spent, steps(point(_, _, unbroken), end, 0, restart(spent)), true).
rule(miss_out, steps(point(State, Filled, broken), end, 0, restart(filled(More))), filled_past(State, Filled, More)).
rule(filled_past, filled_past(State, Filled, More),
     ( given(fills(State, Own)), given(relief_drive(Full, _)), More is min(Full, Filled + Own) )).
rule(ended, ends_in(restart(Kind), Kind, 1), true).
rule(ended_otherwise, ends_in(restart(Other), Kind, 0), Other \== Kind).
rule(ends_from_point, ends_in(point(State, Filled, Run), Kind, Chance), given(ending(State, Filled, Run, Kind, Chance))).
rule(ends_never, ends_in(point(State, Filled, Run), Kind, 0),
     ( given(point(State, Filled, Run)), \+ given(ending(State, Filled, Run, Kind, _)) )).
rule(ending_part, ending_part(point(State, Filled, Run), Kind, Part),
     ( given(outcome(State, Share, _, _, Target, Hits)), steps(point(State, Filled, Run), Target, Hits, Landing),
       ends_in(Landing, Kind, Chance), Part is Share * Chance )).
rule(ending_weighed, ending_weighed(State, Filled, Run, Kind, Verdict),
     ( given(ending(State, Filled, Run, Kind, Engine)), findall(Part, ending_part(point(State, Filled, Run), Kind, Part), Parts),
       sum_list(Parts, Mine), Gap is abs(Mine - Engine), verdict(Gap, 1.0e-9, Verdict) )).
rule(point_whole, point_whole(State, Filled, Run, Verdict),
     ( given(point(State, Filled, Run)), findall(Chance, given(ending(State, Filled, Run, _, Chance)), Chances),
       sum_list(Chances, Sum), Gap is abs(Sum - 1), verdict(Gap, 1.0e-9, Verdict) )).
rule(arrives_in_state, arrives(state(State), Run, point(State, 0, Run)), true).
rule(arrives_at_end, arrives(end, broken, restart(filled(0))), true).
rule(arrives_at_end_spent, arrives(end, unbroken, restart(spent)), true).
rule(after_first_hit, after_first_hit(Kind, Chance),
     ( findall(Part, first_hit_part(Kind, Part), Parts), sum_list(Parts, Chance) )).
rule(first_hit_part, first_hit_part(Kind, Part),
     ( given(outcome(first_hit, Share, _, _, Target, _)), arrives(Target, broken, Landing), ends_in(Landing, Kind, Chance), Part is Share * Chance )).
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
       findall(outcome(Share, Rounds, Balls, Target, Hits), given(outcome(From, Share, Rounds, Balls, Target, Hits)), Stored),
       alike(Made, Stored, Verdict) )).
rule(check_regular, regular_check(Mine, Engine, Verdict),
     ( given(spec_regular(Hit)), Mine is 1 / Hit, given(regular_one_in(Engine)), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_relief_drive, relief_drive_check(Made, Stored, Verdict),
     ( findall(drive(Gauge, Target), made_relief_drive(Gauge, Target), Made),
       findall(drive(Gauge, Target), given(relief_drive(Gauge, Target)), Stored), same(Made, Stored, Verdict) )).
rule(made_relief_drive, made_relief_drive(Gauge, Target), ( given(spec_relief_drive(Gauge, To)), enters(mode(To), Target) )).
rule(check_shares, shares_check(From, Sum, Verdict),
     ( findall(Share, given(outcome(From, Share, _, _, _, _)), Shares), sum_list(Shares, Sum), Gap is abs(Sum - 1), verdict(Gap, 1.0e-9, Verdict) )).
rule(check_ends, ends_check(Stuck, Verdict), ( stuck_states(Stuck), length(Stuck, Count), verdict(Count, 0, Verdict) )).
rule(check_state_rounds, state_rounds_check(Index, Mine, Engine, Verdict),
     ( given(state_rounds(Index, Engine)), rounds_from(Index, Mine), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_state_balls, state_balls_check(Index, Mine, Engine, Verdict),
     ( given(state_balls(Index, Engine)), balls_from(Index, Mine), Gap is abs(Mine - Engine),
       Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_fills, fills_check(Index, Mine, Engine, Verdict),
     ( given(fills(Index, Engine)), made_fills(Index, Mine), Gap is abs(Mine - Engine), verdict(Gap, 0, Verdict) )).
rule(check_endings, endings_check(Count, Wrong, Verdict),
     ( findall(Each, ending_weighed(_, _, _, _, Each), All), length(All, Count), failures(All, Wrong), verdict(Wrong, 0, Verdict) )).
rule(check_points, points_check(Count, Wrong, Verdict),
     ( findall(Each, point_whole(_, _, _, Each), All), length(All, Count), failures(All, Wrong), verdict(Wrong, 0, Verdict) )).
rule(check_weight, weight_check(Kind, Mine, Engine, Verdict),
     ( given(restart(Kind, Engine)), findall(Part, flows_in(Kind, Part), Parts), sum_list(Parts, Mine),
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
rule(odd_empty_share, remark(empty_share(From)), ( given(outcome(From, Share, _, _, _, _)), Share =< 0 )).
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
       ( given(own_payout) -> state_balls_check(Index, _, _, _) ; true ) )).
rule(chain, chain,
     ( shares_check(first_hit, _, _), findall(Index, state_whole(Index), _), ends_check(_, _) )).
rule(state_whole, state_whole(Index), ( given(state(Index)), shares_check(Index, _, _) )).
rule(made, made,
     ( regular_check(_, _, _), made_check(first_hit, _), findall(Index, state_made(Index), _), relief_drive_check(_, _, _) )).
rule(state_made, state_made(Index),
     ( given(state(Index)), made_check(Index, _), ( given(relief_drive(_, _)) -> fills_check(Index, _, _, _) ; true ) )).
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
prove(Goal, checked(Goal)) :- compared(Goal), !, call(Goal).
prove(Goal, done) :- worked(Goal), !, call(Goal).
prove(Goal, step(Name, Goal, Premises)) :- rule(Name, Goal, Body), prove_all(Body, Premises).

prove_all((First, Rest), [Proof|Proofs]) :- !, prove(First, Proof), prove_all(Rest, Proofs).
prove_all(Goal, [Proof]) :- prove(Goal, Proof).

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

keys_of([], []).
keys_of([Key-_|Pairs], [Key|Keys]) :- keys_of(Pairs, Keys).
values_of([], []).
values_of([_-Value|Pairs], [Value|Values]) :- values_of(Pairs, Values).

% Two lists of outcomes alike: the same rounds, balls, target and jackpots each, and
% chances apart by no more than rounding.
alike(Made, Stored, Verdict) :- ( alike_each(Made, Stored) -> Verdict = holds ; Verdict = fails ).
alike_each([], []).
alike_each([outcome(P, Rounds, Balls, Target, Hits)|Made], [outcome(Q, Rounds2, Balls2, Target2, Hits2)|Stored]) :-
    abs(P - Q) =< 1.0e-9, Rounds =:= Rounds2, Balls =:= Balls2, Target == Target2, Hits =:= Hits2, alike_each(Made, Stored).
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
    given(outcome(Index, Share, _, _, Target, _)), Share > 0, ( Target == end ; Target = state(Next), member(Next, Known) ), !.
