% The grounds of an AT machine's formula, as rules a proof is built from.
%
% Facts arrive as given/1: the machine's bet, ベース and 純増 — with the
% shares of the AT's medals won at another 純増, where it has them — and under each
% setting level the regular games a cycle lasts — from one AT to the next, as
% the engine solved it — what the AT gains, the 機械割 the spec states where
% the AT's medals are to follow from it, and the engine's own figures. Each
% rule/3 names a step of reasoning, what it concludes, and from what;
% prove/2 follows the rules and returns the proof.
%
% A cycle is so many regular games, each staking the bet and losing what
% the ベース says, then an AT that gains its medals at the 純増 a game, each
% of those games staked like any other. Medals out over medals in is the
% 機械割; solved for the AT's medals, it is what a stated 機械割 implies.

:- dynamic(given/1).

% 通常時1Gあたりの減り: fifty medals over the games they last.
rule(loss_per_game, loss_per_game(Loss), ( given(base(Games)), Loss is 50 / Games )).

% 純増: the AT's own, or over all its medals where shares of them are won
% at another. A medal won at a 純増 of N takes 1/N games, so the AT's games
% a medal are each share over its 純増, summed, and the 純増 over all is one
% over that.
rule(net_single, net(Net), ( \+ given(other_net(_, _)), given(net_per_game(Net)) )).
rule(net_over_all, net(Net),
     ( findall(Share, other_share(Share), Shares), sum_list(Shares, Shared), Shared > 0,
       given(net_per_game(Own)),
       findall(Games, other_games(_, Games), Others), sum_list(Others, OtherGames),
       GamesAMedal is (1 - Shared) / Own + OtherGames, Net is 1 / GamesAMedal,
       engine_check(net, Net, _, _) )).
rule(other_share, other_share(Share), given(other_net(_, Share))).
rule(other_games, other_games(Share, Games), ( given(other_net(Net, Share)), Games is Share / Net )).

% ATの平均獲得枚数: what the stated 機械割 implies, or as the engine solved it.
rule(gain_from_rate, gain(Level, Gain),
     ( given(stated_rate(Level, Rate)), given(cycle_games(Level, Games)), given(bet(Bet)), net(Net),
       loss_per_game(Loss), Spread is 1 + Bet * (1 - Rate) / Net, Gain is Games * (Bet * (Rate - 1) + Loss) / Spread )).
rule(gain_solved, gain(Level, Gain), ( \+ given(stated_rate(Level, _)), given(gain(Level, Gain)) )).

% 機械割: medals out over medals in, across a cycle and its AT.
rule(rate, rate(Level, Rate),
     ( gain(Level, Gain), given(cycle_games(Level, Games)), given(bet(Bet)), net(Net), loss_per_game(Loss),
       AtGames is Gain / Net, Staked is Bet * (Games + AtGames), Out is Staked - Loss * Games + Gain, Rate is Out / Staked )).

% Checks, each ending in a verdict rather than failing, so a disagreement
% is shown, not hidden: a figure reasoned here against the engine's, and
% the 機械割 worked back from the AT's medals against the one stated.
rule(check_engine, engine_check(Figure, Mine, Engine, Verdict),
     ( given(engine(Figure, Engine)), Gap is abs(Mine - Engine), Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_stated, stated_check(Level, Mine, Stated, Verdict),
     ( given(stated_rate(Level, Stated)), Gap is abs(Mine - Stated), Limit is 1.0e-9, verdict(Gap, Limit, Verdict) )).
rule(within, verdict(Gap, Limit, holds), Gap =< Limit).
rule(beyond, verdict(Gap, Limit, fails), Gap > Limit).

rule(level, level(Level, Gain, Rate),
     ( given(level(Level)), gain(Level, Gain), engine_check(gain(Level), Gain, _, _),
       rate(Level, Rate), engine_check(rate(Level), Rate, _, _),
       ( given(stated_rate(Level, _)) -> stated_check(Level, Rate, _, _) ; true ) )).
rule(grounds, grounds(Levels), findall(level(Level, Gain, Rate), level(Level, Gain, Rate), Levels)).

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
