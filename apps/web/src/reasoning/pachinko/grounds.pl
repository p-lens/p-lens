% The grounds of a formula, as rules a proof is built from.
%
% Facts arrive as given/1: the basis as the engine normalised it, and the
% figures the engine solved from it. Each rule/3 names a step of reasoning,
% what it concludes, and from what; prove/2 follows the rules and returns the
% proof — every step, every given it rests on, every sum worked — so the
% screen can say how a figure came to be, and check it against the engine.

:- dynamic(given/1).

% 1R トータル確率: regular-game spins per round won.
rule(round_chance, round_chance(OneIn),
     ( \+ given(relief_drive(_, _)), given(regular_one_in(P)), rounds_per_first_hit(R), OneIn is P / R )).
rule(round_chance_with_relief_drive, round_chance(OneIn),
     ( given(relief_drive(_, _)), findall(Spins-Rounds, weighted_cycle(_, _, Spins, Rounds), Pairs),
       keys_of(Pairs, AllSpins), values_of(Pairs, AllRounds), sum_list(AllSpins, Spins), sum_list(AllRounds, Rounds),
       OneIn is Spins / Rounds )).

% A first jackpot's rounds: each share of its allotment, its own rounds and
% what the mode it leads to yields from there.
rule(rounds_per_first_hit, rounds_per_first_hit(R),
     ( findall(Part, allotted(Part), Parts), sum_list(Parts, R) )).
rule(allotted, allotted(Part),
     ( given(entry(Share, Rounds, Target)), rounds_after(Target, After), Part is Share * (Rounds + After) )).
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
% payout: the figure is every round's gain over every round, over the long run.
rule(payout_from_spec, payout_per_round(Balls),
     ( \+ given(own_payout), given(payout(Prize, Count)), \+ given(measured(_)), Balls is Prize * Count - Count )).
rule(payout_measured, payout_per_round(Balls), ( \+ given(own_payout), given(measured(Balls)) )).
rule(payout_by_share, payout_per_round(Balls),
     ( given(own_payout), balls_per_cycle(B), rounds_per_cycle(R), given(payout_scale(Scale)), Balls is B * Scale / R )).

rule(rounds_per_cycle, rounds_per_cycle(R), ( \+ given(relief_drive(_, _)), rounds_per_first_hit(R) )).
rule(rounds_per_cycle_with_relief_drive, rounds_per_cycle(R),
     ( given(relief_drive(_, _)), findall(Rounds, weighted_cycle(_, _, _, Rounds), All), sum_list(All, R) )).
rule(balls_per_cycle, balls_per_cycle(B), ( \+ given(relief_drive(_, _)), balls_per_first_hit(B) )).
rule(balls_per_cycle_with_relief_drive, balls_per_cycle(B),
     ( given(relief_drive(_, _)), findall(Balls, weighted_balls(_, _, Balls), All), sum_list(All, B) )).

% A first jackpot's balls: each share of its allotment, what its own rounds
% gain and what the mode it leads to gains from there.
rule(balls_per_first_hit, balls_per_first_hit(B),
     ( findall(Part, paid(Part), Parts), sum_list(Parts, B) )).
rule(paid, paid(Part),
     ( given(entry_pays(Share, Balls, Target)), balls_after(Target, After), Part is Share * (Balls + After) )).
rule(balls_back_to_regular, balls_after(end, 0), true).
rule(balls_into_mode, balls_after(state(Index), After), given(state_balls(Index, After))).
rule(weighted_balls, weighted_balls(Kind, Weight, Weighted),
     ( given(restart(Kind, Weight)), balls_from(Kind, Balls), Weighted is Weight * Balls )).
rule(balls_filled, balls_from(filled(Filled), Balls),
     ( given(relief_drive(Full, Target)), given(regular_one_in(P)), Left is max(0, Full - Filled),
       Reach is (1 - 1 / P) ** Left, balls_per_first_hit(B), balls_after(Target, After),
       Balls is (1 - Reach) * B + Reach * After )).
rule(balls_spent, balls_from(spent, Balls), balls_per_first_hit(Balls)).

% Checks, each ending in a verdict rather than failing, so a disagreement
% is shown, not hidden: a figure reasoned here against the engine's, and a
% sampled figure against the exact one, within twice its margin.
rule(check_engine, engine_check(Figure, Mine, Engine, Verdict),
     ( given(engine(Figure, Engine)), Gap is abs(Mine - Engine), Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_sample, sample_check(Exact, Sampled, Margin, Verdict),
     ( given(sampled(Sampled, Margin)), Gap is abs(Exact - Sampled), Limit is 2 * Margin, verdict(Gap, Limit, Verdict) )).
rule(within, verdict(Gap, Limit, holds), Gap =< Limit).
rule(beyond, verdict(Gap, Limit, fails), Gap > Limit).

rule(grounds, grounds(OneIn, Balls),
     ( round_chance(OneIn), engine_check(round_chance, OneIn, _, _),
       payout_per_round(Balls), engine_check(payout_per_round, Balls, _, _),
       ( given(sampled(_, _)) -> sample_check(OneIn, _, _, _) ; true ) )).

% prove(Goal, Proof): Goal holds, and Proof says why.
prove(given(Fact), given(Fact)) :- !, given(Fact).
prove(X is Expression, computed(X, Expression)) :- !, X is Expression.
prove(sum_list(Parts, Sum), computed(Sum, sum(Parts))) :- !, sum_list(Parts, Sum).
prove(findall(Template, Goal, Found), collected(Proofs)) :- !,
    findall(Template-Proof, prove(Goal, Proof), Pairs), keys_of(Pairs, Found), values_of(Pairs, Proofs).
prove(\+ Goal, absent(Goal)) :- !, \+ prove(Goal, _).
prove((If -> Then ; Else), Proof) :- !, ( prove(If, _) -> prove(Then, Proof) ; prove(Else, Proof) ).
prove(Left > Right, checked(Left > Right)) :- !, Left > Right.
prove(keys_of(Pairs, Keys), done) :- !, keys_of(Pairs, Keys).
prove(values_of(Pairs, Values), done) :- !, values_of(Pairs, Values).
prove(true, done) :- !.
prove(Left =< Right, checked(Left =< Right)) :- !, Left =< Right.
prove(Goal, step(Name, Goal, Premises)) :- rule(Name, Goal, Body), prove_all(Body, Premises).

prove_all((First, Rest), [Proof|Proofs]) :- !, prove(First, Proof), prove_all(Rest, Proofs).
prove_all(Goal, [Proof]) :- prove(Goal, Proof).

keys_of([], []).
keys_of([Key-_|Pairs], [Key|Keys]) :- keys_of(Pairs, Keys).
values_of([], []).
values_of([_-Value|Pairs], [Value|Values]) :- values_of(Pairs, Values).
