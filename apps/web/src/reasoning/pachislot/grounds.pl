% The grounds of an AT machine's formula, as rules a proof is built from.
%
% Facts arrive as given/1: the machine's bet, ベース and 純増 — with the
% shares of the AT's medals won at another 純増, where it has them — and
% under each setting level what its analysis sheet publishes — the 初当たり
% of the AT or of the CZ that brings it, the CZ's success rate, the AT's
% medals or the 機械割 they are to follow from — beside the engine's own
% figures and the 機械割 the formula stores. Each rule/3 names a step of
% reasoning, what it concludes, and from what; prove/2 follows the rules
% and returns the proof.
%
% A cycle is so many regular games, each staking the bet and losing what
% the ベース says, then an AT that gains its medals at the 純増 a game, each
% of those games staked like any other — and where the trigger is a bonus,
% each it brings gaining its medals over games of its own. Medals out over medals in is the
% 機械割; solved for the AT's medals, it is what a stated 機械割 implies.
%
% The engine is checked, not believed. The games a cycle lasts follow from
% the published 初当たり, and an AT's medals from its payout, its sets or
% its table. Where an AT間天井 cuts a cycle short or the 有利区間's cap cuts
% an AT short, the sheet's figures alone do not say by how much: the
% machine is then played out here, by another way than the engine's — the
% chance play has lasted each game, and how often an AT starts from each
% sum held — from the one figure taken from the engine, the trigger's
% chance below its ceilings, which is itself checked by the 初当たり it
% comes back to. What still cannot be checked is said to be unchecked, and
% what holds but is guessed to be out of the ordinary is remarked on
% beside it, as a guess.

:- dynamic(given/1).
:- dynamic(memo/2).

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

% 1周期の通常ゲーム数: from one AT to the next. The published 初当たり is
% of the trigger — the AT itself, or the CZ that brings it — ceilings
% included, so a cycle lasts the triggers it brings over that chance. An AT
% won directly is one trigger. A CZ is tried until one wins: one over its
% success rate, or within a スルー天井 the sum of the chances each try is
% reached. A mode's AT間天井 cuts a cycle short where play enters it, and
% the cycle is then played out, mode by mode, from the trigger's chance
% below its ceilings.
rule(won_directly, triggers(_, 1), \+ given(cz)).
rule(won_by_success, triggers(Level, Triggers),
     ( given(cz), \+ given(misses(_)), given(success(Level, Success)), Triggers is 1 / Success )).
rule(won_within_misses, triggers(Level, Triggers),
     ( given(cz), given(misses(Misses)), given(success(Level, Success)), Success > 0,
       Triggers is (1 - (1 - Success) ** (Misses + 1)) / Success )).
rule(won_on_the_last_miss, triggers(Level, Triggers),
     ( given(cz), given(misses(Misses)), given(success(Level, Success)), Success =< 0, Triggers is Misses + 1 )).
rule(cycle_from_first_hit, cycle_games(Level, Games),
     ( \+ cut_short(Level), given(first_hit(Level, Chance)), triggers(Level, Triggers), Games is Triggers / Chance )).
rule(cycle_to_at_ceiling, cycle_games(Level, Games), ( cut_short(Level), cycle(Level, Games, _) )).
rule(cut_short, cut_short(Level), ( shares(Level, Shares), at_ceilings(AtCeilings), entered_ceiling(Shares, AtCeilings) )).

% Where a trigger comes, once, on a game counted from the last AT, the
% cycle is not played out here: the engine's games and triggers are taken,
% and said to be unchecked.
% A cycle played out from the trigger's chance below its ceilings: the
% games it lasts and the triggers it brings, over the modes as an AT
% allots them. In a mode without an AT間天井 the triggers come so many
% games apart on average, its ceiling included. In one with an AT間天井,
% the chance play has lasted each game is worked game by game up to it.
rule(cycle_cut, cycle(Level, Games, Triggers),
     ( cut_short(Level), \+ given(forced_from_at), given(chance(Level, Chance)), success(Level, Success), mode_misses(Misses),
       ceilings(Ceilings), shares(Level, Shares), at_ceilings(AtCeilings),
       run_cut(Chance, Success, Misses, Ceilings, Shares, AtCeilings, Games, Triggers) )).
rule(cycle_taken, cycle(Level, Games, Triggers),
     ( given(forced_from_at), given(engine(cycle_games(Level), Games)), given(engine(cycle_triggers(Level), Triggers)) )).
rule(cycle_free, cycle(Level, Games, Triggers),
     ( \+ cut_short(Level), given(chance(Level, Chance)), triggers(Level, Triggers), ceilings(Ceilings), shares(Level, Shares),
       games_between(Chance, Ceilings, Shares, Between), Games is Triggers * Between )).
rule(success_of_cz, success(Level, Success), ( given(cz), given(success(Level, Success)) )).
rule(success_direct, success(_, 1), \+ given(cz)).
rule(within_misses, misses(Misses), given(misses(Misses))).
rule(without_misses, misses(none), \+ given(misses(_))).

% Each mode's スルー天井, in the order of the modes: the CZ's, the same for
% every mode, or where a スルー天井 is drawn after each AT, a mode for each
% with its own — a cycle is then played out mode by mode.
rule(misses_shared, mode_misses(Misses), ( \+ given(misses_by_mode), misses(Each), ceilings(Ceilings), repeated(Each, Ceilings, Misses) )).
rule(misses_by_mode, mode_misses(Misses), ( given(misses_by_mode), findall(Each, given(mode_misses(_, Each)), Misses) )).
rule(cut_by_misses, cut_short(_), given(misses_by_mode)).
rule(cut_by_forcing, cut_short(_), given(forced_from_at)).

% A mode's ceiling in regular games: as the sheet gives it, or counted on
% the screen and so reached that many regular games sooner. Its AT間天井,
% where it has one, is in regular games already.
rule(ceilings, ceilings(Ceilings), findall(Games, mode_at(_, Games), Ceilings)).
rule(mode_at, mode_at(Index, Games), ( given(mode(Index, Sheet, _)), in_games(Sheet, Games) )).
rule(at_ceilings, at_ceilings(AtCeilings), findall(AtCeiling, given(mode(_, _, AtCeiling)), AtCeilings)).
rule(no_ceiling, in_games(none, none), true).
rule(ceiling_in_games, in_games(Games, Games), ( Games \== none, \+ given(lcd_rate(_)) )).
rule(ceiling_on_screen, in_games(Screen, Games), ( Screen \== none, given(lcd_rate(Rate)), Games is max(1, ceiling(Screen / Rate)) )).

% The modes a cycle starts from: as an AT allots them, or — where an AT
% that reaches the cap starts play again as after a setting change — the
% two allotments mixed by the share of ATs that do.
rule(shares_after_at, shares(Level, Shares),
     ( \+ given(reset_on_cap), findall(Share, given(allotted(Level, _, Share, _)), Shares) )).
rule(shares_settled, shares(Level, Shares),
     ( given(reset_on_cap), completion(Level, Completion), findall(Share, settled_share(Level, Completion, Share), Shares) )).
rule(settled_share, settled_share(Level, Completion, Share),
     ( given(allotted(Level, _, At, Reset)), Share is (1 - Completion) * At + Completion * Reset )).

% ATの平均獲得枚数: what the stated 機械割 implies, or what the sheet's
% payout comes to — its figure, its sets carried on at a 継続率, or its
% table. Under a cap an AT gains no more than the headroom left: the cap
% less what the 有利区間 already holds, which is what the AT before left,
% less the regular games' loss since, where the next AT comes within the
% window. How often an AT starts from each sum held is worked upward from
% none held, and the medals and the share that reach the cap are averaged
% over them.
rule(gain_from_rate, gain(Level, Gain),
     ( \+ given(trigger_payout(_)), given(stated_rate(Level, Rate)), cycle_games(Level, Games), given(bet(Bet)), net(Net),
       loss_per_game(Loss), Spread is 1 + Bet * (1 - Rate) / Net, Gain is Games * (Bet * (Rate - 1) + Loss) / Spread )).
rule(gain_from_rate_beside_bonuses, gain(Level, Gain),
     ( given(trigger_payout(_)), given(stated_rate(Level, Rate)), cycle_games(Level, Games), bonuses(Level, Bonus, Own),
       given(bet(Bet)), net(Net), loss_per_game(Loss), Spread is 1 + Bet * (1 - Rate) / Net,
       Gain is (Bet * (Rate - 1) * (Games + Own) + Loss * Games - Bonus) / Spread )).
rule(gain_fixed, gain(Level, Gain), ( \+ given(cap(_)), given(law(Level, fixed(Gain))) )).
rule(gain_in_sets, gain(Level, Gain),
     ( \+ given(cap(_)), given(law(Level, sets(First, Set, Carry))), Gain is First + Set * Carry / (1 - Carry) )).
rule(gain_by_table, gain(Level, Gain),
     ( \+ given(cap(_)), given(law(Level, table)), findall(Part, table_part(Level, _, _, Part), Parts), sum_list(Parts, Gain) )).
rule(table_part, table_part(Level, Medals, Share, Part), ( given(payout_row(Level, Medals, Share)), Part is Medals * Share )).
rule(gain_under_cap, gain(Level, Gain), ( given(cap(_)), given(law(Level, _)), capped(Level, Gain, _) )).
rule(gain_solved, gain(Level, Gain), ( gain_taken(Level), given(engine(gain(Level), Gain)) )).
rule(gain_taken, gain_taken(Level), ( given(cap(_)), given(law(Level, _)), \+ capped(Level, _, _) )).
rule(capped, capped(Level, Gain, Completion),
     ( given(cap(Cap)), law(Level, Law), arrivals(Level, Arrivals), loss_per_game(Loss),
       under_cap(Law, Cap, Arrivals, Loss, Gain, Completion) )).
rule(law_as_given, law(Level, Law), ( given(law(Level, Law)), Law \== table )).
rule(law_by_table, law(Level, table(Rows)),
     ( given(law(Level, table)), findall(o(Medals, Share), given(payout_row(Level, Medals, Share)), Rows) )).
rule(arrivals_in_window, arrivals(Level, Arrivals),
     ( given(window(Window)), given(chance(Level, Chance)), success(Level, Success), mode_misses(Misses), ceilings(Ceilings),
       findall(Share, given(allotted(Level, _, Share, _)), Shares), at_ceilings(AtCeilings),
       arriving(Chance, Success, Misses, Ceilings, Shares, AtCeilings, Window, Arrivals) )).
rule(no_window, arrivals(_, none), \+ given(window(_))).
rule(completion_under_cap, completion(Level, Completion), capped(Level, _, Completion)).
rule(completion_solved, completion(Level, Completion), ( \+ capped(Level, _, _), given(engine(completion(Level), Completion)) )).

% ボーナス: where the trigger is a bonus, each one a cycle brings gains its
% medals, the AT won or not, over games of its own — counted where its 純増
% is given — each staked like any other. A cycle brings the triggers it is
% tried until one wins, or as it is played out to an AT間天井, whose AT is
% no bonus's.
rule(cycle_triggers_free, cycle_triggers(Level, Triggers), ( \+ cut_short(Level), triggers(Level, Triggers) )).
rule(cycle_triggers_cut, cycle_triggers(Level, Triggers), ( cut_short(Level), cycle(Level, _, Triggers) )).
rule(bonuses, bonuses(Level, Medals, Games),
     ( given(trigger_payout(Each)), cycle_triggers(Level, Triggers), bonus_games(Each, Own),
       Medals is Triggers * Each, Games is Triggers * Own )).
rule(bonus_games_counted, bonus_games(Each, Own), ( given(trigger_net(Net)), Own is Each / Net )).
rule(bonus_games_uncounted, bonus_games(_, 0), \+ given(trigger_net(_))).

% 機械割: medals out over medals in, across a cycle and its AT, and its
% bonuses where the trigger is one.
rule(rate, rate(Level, Rate),
     ( \+ given(trigger_payout(_)), gain(Level, Gain), cycle_games(Level, Games), given(bet(Bet)), net(Net), loss_per_game(Loss),
       AtGames is Gain / Net, Staked is Bet * (Games + AtGames), Out is Staked - Loss * Games + Gain, Rate is Out / Staked )).
rule(rate_beside_bonuses, rate(Level, Rate),
     ( given(trigger_payout(_)), gain(Level, Gain), cycle_games(Level, Games), bonuses(Level, Bonus, Own), given(bet(Bet)), net(Net),
       loss_per_game(Loss), AtGames is Gain / Net, Staked is Bet * (Games + Own + AtGames),
       Out is Staked - Loss * Games + Gain + Bonus, Rate is Out / Staked )).

% Checks, each ending in a verdict rather than failing, so a disagreement
% is shown, not hidden: the 初当たり the engine's chance below the ceilings
% comes back to against the one published, a figure reasoned here against the engine's and
% against the one stored — a sampled one within twice its margin — and the
% 機械割 worked back from the AT's medals against the one stated.
rule(check_chance, chance_check(Level, Mine, Published, Verdict),
     ( cycle(Level, Games, Triggers), Mine is Triggers / Games, given(first_hit(Level, Published)), Gap is abs(Mine - Published),
       Limit is 1.0e-9 * Published, verdict(Gap, Limit, Verdict) )).
rule(check_engine, engine_check(Figure, Mine, Engine, Verdict),
     ( given(engine(Figure, Engine)), Gap is abs(Mine - Engine), Limit is 1.0e-9 * max(1, abs(Engine)), verdict(Gap, Limit, Verdict) )).
rule(check_stored, stored_check(Figure, Mine, Stored, Verdict),
     ( given(stored(Figure, Stored)), Gap is abs(Mine - Stored), Limit is 1.0e-9 * max(1, abs(Stored)), verdict(Gap, Limit, Verdict) )).
rule(check_sample, sample_check(Level, Exact, Sampled, Margin, Verdict),
     ( given(sampled(Level, Sampled, Margin)), Gap is abs(Exact - Sampled), Limit is 2 * Margin, verdict(Gap, Limit, Verdict) )).
rule(check_stated, stated_check(Level, Mine, Stated, Verdict),
     ( given(stated_rate(Level, Stated)), Gap is abs(Mine - Stated), Limit is 1.0e-9, verdict(Gap, Limit, Verdict) )).
rule(within, verdict(Gap, Limit, holds), Gap =< Limit).
rule(beyond, verdict(Gap, Limit, fails), Gap > Limit).

% What is not checked here, said rather than passed over: an AT's medals
% under a cap where a regular game's loss in the window could undo an AT's
% whole gain, which the working upward does not allow for; and the share
% of ATs that reach the cap where the AT's medals follow from the 機械割.
rule(unverified_forced_cycle, remark(forced_cycle), given(forced_from_at)).
rule(unverified_capped_gain, remark(capped_gain(Cap)), ( given(cap(Cap)), given(level(Level)), gain_taken(Level) )).
rule(unverified_completion, remark(completion),
     ( given(reset_on_cap), given(level(Level)), given(stated_rate(Level, _)) )).

% What holds, but is guessed to be out of the ordinary. A regular game
% cannot lose more than it stakes, so a ベース that says it does is not a
% machine's. An AT that gains nothing is a guess at what to doubt, not
% knowledge of machines: what is known is only that none of the catalog's
% 190 pachislot formulas with a 純増 showed one on 2026-10-13.
rule(odd_loss_beyond_bet, remark(loss_beyond_bet(Loss, Bet)), ( loss_per_game(Loss), given(bet(Bet)), Loss > Bet )).
rule(odd_no_gain, remark(no_gain(Level, Gain)), ( gain(Level, Gain), Gain =< 0 )).

% The grounds: each setting level's figures and their checks, then the
% remarks. Each level is attempted on its own, so one that cannot be
% proved is shown as unproved beside the others.
rule(level, level(Level, Gain, Rate),
     ( cycle_games(Level, Games), engine_check(cycle_games(Level), Games, _, _),
       chance_check(Level, _, _, _),
       gain(Level, Gain), ( gain_taken(Level) -> true ; engine_check(gain(Level), Gain, _, _) ),
       ( capped(Level, _, Completion) -> engine_check(completion(Level), Completion, _, _) ; true ),
       rate(Level, Rate), engine_check(rate(Level), Rate, _, _),
       ( given(sampled(Level, _, _)) -> sample_check(Level, Rate, _, _, _) ; stored_check(rate(Level), Rate, _, _) ),
       ( given(stated_rate(Level, _)) -> stated_check(Level, Rate, _, _) ; true ) )).
rule(level_attempted, level_attempted(Level), ( given(level(Level)), attempt(level(Level, _, _)) )).
rule(remarks, remarks, findall(Remark, remark(Remark), _)).
rule(grounds, grounds, ( findall(Level, level_attempted(Level), _), attempt(remarks) )).

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
compared(_ =< _).
compared(_ \== _).
worked(keys_of(_, _)).
worked(values_of(_, _)).
worked(games_between(_, _, _, _)).
worked(entered_ceiling(_, _)).
worked(run_cut(_, _, _, _, _, _, _, _)).
worked(arriving(_, _, _, _, _, _, _, _)).
worked(under_cap(_, _, _, _, _, _)).
worked(repeated(_, _, _)).

repeated(_, [], []).
repeated(Each, [_|Rest], [Each|Repeated]) :- repeated(Each, Rest, Repeated).

keys_of([], []).
keys_of([Key-_|Pairs], [Key|Keys]) :- keys_of(Pairs, Keys).
values_of([], []).
values_of([_-Value|Pairs], [Value|Values]) :- values_of(Pairs, Values).

% What is worked once is kept: a proof comes to the same sum many times.
remembered(Key, Value, Goal) :- ( memo(Key, Found) -> Value = Found ; call(Goal), assertz(memo(Key, Value)) ).

zeros(0, []) :- !.
zeros(Count, [0.0|Zeros]) :- Less is Count - 1, zeros(Less, Zeros).

% Whether play enters a mode with an AT間天井: one some share allots it.
entered_ceiling([Share|_], [AtCeiling|_]) :- Share > 0, AtCeiling \== none, !.
entered_ceiling([_|Shares], [_|AtCeilings]) :- entered_ceiling(Shares, AtCeilings).

% Games on average between triggers, over the modes by their shares:
% (1 − (1 − p)^C) / p in a mode with a ceiling of C, 1 / p in one without.
games_between(Chance, Ceilings, Shares, Mean) :- between_modes(Ceilings, Shares, Chance, 0.0, Mean).
between_modes([], [], _, Mean, Mean).
between_modes([Ceiling|Ceilings], [Share|Shares], Chance, Sum, Mean) :-
    between_games(Chance, Ceiling, Games),
    Next is Sum + Share * Games, between_modes(Ceilings, Shares, Chance, Next, Mean).
between_games(Chance, none, Games) :- !, Games is 1 / Chance.
between_games(Chance, Ceiling, Games) :- Games is (1 - (1 - Chance) ** Ceiling) / Chance.

% The triggers tried until one wins, as the rules for them reckon it, for a
% mode a cycle plays out without an AT間天井 beside one with.
tries(Success, none, Tries) :- !, Success > 0, Tries is 1 / Success.
tries(Success, Misses, Tries) :- Success > 0, !, Tries is (1 - (1 - Success) ** (Misses + 1)) / Success.
tries(_, Misses, Tries) :- Tries is Misses + 1.

% Play in one mode, game by game from an AT, for so many games: the chance
% it has lasted each game without the AT, and the triggers it has brought
% by then. The games to the next trigger are p a game below the ceiling and
% certain on it; a trigger wins the AT at the success rate, and certainly
% once so many have missed. With none missed yet, play lasts g games if no
% trigger comes in them, or if one comes on the nth and misses and play
% then lasts the g − n left with one more missed: each list is worked from
% the one with one more missed, or — without a スルー天井 — from itself,
% every game resting only on games before it.
mode_run(Chance, Success, Misses, Ceiling, Length, Lasting, Counted) :-
    Risk is 1 - Chance, survivals(0, Length, Risk, Ceiling, 1.0, Untriggered), complements(Untriggered, Triggered), Keep is 1 - Success,
    (   Misses == none
    ->  renewed(Untriggered, Lasting, Keep, Chance, Ceiling, Lasting), renewed(Triggered, Counted, Keep, Chance, Ceiling, Counted)
    ;   folded(Misses, Untriggered, Untriggered, Keep, Chance, Ceiling, Lasting),
        folded(Misses, Triggered, Triggered, Keep, Chance, Ceiling, Counted) ).
survivals(Length, Length, _, _, _, []) :- !.
survivals(Game, Length, Risk, Ceiling, Power, [Chance|Chances]) :-
    ( ( Ceiling == none ; Game < Ceiling ) -> Chance = Power ; Chance = 0.0 ),
    Next is Power * Risk, After is Game + 1, survivals(After, Length, Risk, Ceiling, Next, Chances).
complements([], []).
complements([Chance|Chances], [Other|Others]) :- Other is 1 - Chance, complements(Chances, Others).
folded(0, _, List, _, _, _, List) :- !.
folded(Misses, Bases, In, Keep, Chance, Ceiling, Out) :-
    renewed(Bases, In, Keep, Chance, Ceiling, Next), Fewer is Misses - 1, folded(Fewer, Bases, Next, Keep, Chance, Ceiling, Out).

% Out(g) = Base(g) + Keep × Σ over n of the chance the next trigger comes on
% the nth game × In(g − n). The chances are geometric below the ceiling, so
% a running sum gives each game in turn: last game's sum decayed, the game
% before added, and what has reached the ceiling taken out and counted
% whole. In may be Out itself, read only where it is already worked.
renewed(Bases, In, Keep, Chance, Ceiling, Out) :-
    Risk is 1 - Chance,
    (   Ceiling == none
    ->  Tail = 0.0, length(Bases, Length), zeros(Length, Far)
    ;   Tail is Risk ** (Ceiling - 1), zeros(Ceiling, Pad), append(Pad, In, Far) ),
    renewed(Bases, [0.0|In], Far, Keep, Chance, Risk, Tail, 0.0, Out).
renewed([], _, _, _, _, _, _, _, []).
renewed([Base|Bases], [Near|Nears], [Far|Fars], Keep, Chance, Risk, Tail, Running, [Value|Values]) :-
    Reached is Far * Tail, Next is Risk * Running + Near - Reached,
    Value is Base + Keep * (Chance * Next + Reached),
    renewed(Bases, Nears, Fars, Keep, Chance, Risk, Tail, Next, Values).

% A cycle each mode's AT間天井 ends at the latest: the games it lasts are
% the chances play has lasted each game before the ceiling, summed; the
% triggers, those brought by the game before it. A mode without one lasts
% its tries, each the games between triggers apart.
run_cut(Chance, Success, Misses, Ceilings, Shares, AtCeilings, Games, Triggers) :-
    remembered(run(Chance, Success, Misses, Ceilings, Shares, AtCeilings), Games-Triggers,
               cut_modes(Ceilings, Shares, AtCeilings, Chance, Success, Misses, 0.0, 0.0, Games, Triggers)).
cut_modes([], [], [], _, _, _, Games, Triggers, Games, Triggers).
cut_modes([Ceiling|Ceilings], [Share|Shares], [AtCeiling|AtCeilings], Chance, Success, [Misses|MoreMisses], Games0, Triggers0, Games, Triggers) :-
    (   Share =:= 0
    ->  Games1 = Games0, Triggers1 = Triggers0
    ;   AtCeiling == none
    ->  tries(Success, Misses, Brought), between_games(Chance, Ceiling, Between),
        Games1 is Games0 + Share * Brought * Between, Triggers1 is Triggers0 + Share * Brought
    ;   mode_run(Chance, Success, Misses, Ceiling, AtCeiling, Lasting, Counted), sum_list(Lasting, Lasted), last(Counted, Brought),
        Games1 is Games0 + Share * Lasted, Triggers1 is Triggers0 + Share * Brought ),
    cut_modes(Ceilings, Shares, AtCeilings, Chance, Success, MoreMisses, Games1, Triggers1, Games, Triggers).

% The chance the next AT is won on each game of the window after one: the
% chance play lasted to the game before less the chance it lasts this one,
% and whatever is left on the game of the mode's AT間天井.
arriving(Chance, Success, Misses, Ceilings, Shares, AtCeilings, Window, Arrivals) :-
    remembered(arriving(Chance, Success, Misses, Ceilings, Shares, AtCeilings, Window), Arrivals,
               ( zeros(Window, None), arriving_modes(Ceilings, Shares, AtCeilings, Chance, Success, Misses, Window, None, Arrivals) )).
arriving_modes([], [], [], _, _, _, _, Arrivals, Arrivals).
arriving_modes([Ceiling|Ceilings], [Share|Shares], [AtCeiling|AtCeilings], Chance, Success, [Misses|MoreMisses], Window, Sum, Arrivals) :-
    (   Share =:= 0
    ->  Next = Sum
    ;   ( AtCeiling == none -> Reach is Window + 1 ; Reach is min(AtCeiling, Window + 1) ),
        mode_run(Chance, Success, Misses, Ceiling, Reach, Lasting, _), won_each(Lasting, Won),
        ( Reach > Window -> Wins = Won ; last(Lasting, Left), Rest is Window - Reach, zeros(Rest, None), append(Won, [Left|None], Wins) ),
        weighed(Sum, Share, Wins, Next) ),
    arriving_modes(Ceilings, Shares, AtCeilings, Chance, Success, MoreMisses, Window, Next, Arrivals).
won_each([_], []) :- !.
won_each([Before, After|Lasting], [Won|Wins]) :- Won is Before - After, won_each([After|Lasting], Wins).
weighed([], _, [], []).
weighed([Sum|Sums], Share, [Value|Values], [Next|Nexts]) :- Next is Sum + Share * Value, weighed(Sums, Share, Values, Nexts).

% An AT under the cap, averaged over every AT of a 有利区間. An AT that
% starts with so many medals held gains what its law says where that is
% short of the headroom, and the headroom where it is not, reaching the
% cap. One that falls short leaves what it held and gained; the next AT,
% where it comes within the window, starts from that less the regular
% games' loss by then, in whole medals. Every AT gains more than a window's
% games can lose — or this fails, and nothing is claimed — so an AT only
% ever starts from more than the one before: how often one starts from each
% sum is worked upward from none held, each resting only on sums below it.
under_cap(Law, Cap, Arrivals, Loss, Gain, Completion) :-
    remembered(cap(Law, Cap, Arrivals, Loss), Gain-Completion,
               ( short_of(Law, Cap, Outcomes), starts(Outcomes, Cap, Arrivals, Loss, Starts),
                 totals(Starts, 0, Outcomes, Cap, 0.0, 0.0, 0.0, Ats, Completed, Gained),
                 Gain is Gained / Ats, Completion is Completed / Ats )).
short_of(fixed(Medals), Cap, Outcomes) :- ( Medals < Cap -> Outcomes = [o(Medals, 1.0)] ; Outcomes = [] ).
short_of(sets(First, Set, Carry), Cap, Outcomes) :- Set > 0, sets_below(0, First, Set, Carry, Cap, Outcomes).
short_of(table(Rows), Cap, Outcomes) :- findall(o(Medals, Chance), ( member(o(Medals, Chance), Rows), Medals < Cap ), Outcomes).
sets_below(Sets, First, Set, Carry, Cap, Outcomes) :-
    Medals is First + Sets * Set,
    (   Medals < Cap
    ->  Chance is Carry ** Sets * (1 - Carry), More is Sets + 1, Outcomes = [o(Medals, Chance)|Rest],
        sets_below(More, First, Set, Carry, Cap, Rest)
    ;   Outcomes = [] ).
starts(_, _, none, _, [1.0]) :- !.
starts(Outcomes, Cap, Arrivals, Loss, Starts) :-
    lost_by(Arrivals, 0, Loss, [], Kernel), length(Kernel, Width), Reach is Width - 1,
    \+ ( member(o(Medals, _), Outcomes), round(Medals * 1.0) =< Reach ),
    Whole is round(Cap * 1.0), Steps is Whole + 1 + Reach,
    delayed(Outcomes, Cap, Starts, Lags), zeros(Reach, Pad), append(Pad, Held, Window),
    swept(0, Steps, Whole, Reach, Lags, Held, Window, Kernel, Starts).
% The chance the next AT comes having lost so many whole medals since.
lost_by([], _, _, Kernel, Kernel).
lost_by([Arrival|Arrivals], Since, Loss, Kernel0, Kernel) :-
    Lost is max(0, ceiling(Loss * Since - 0.5)), put(Lost, Arrival, Kernel0, Kernel1), Later is Since + 1,
    lost_by(Arrivals, Later, Loss, Kernel1, Kernel).
put(0, Value, [], [Value]) :- !.
put(0, Value, [Old|Rest], [New|Rest]) :- !, New is Old + Value.
put(At, Value, [], [0.0|Rest]) :- !, Before is At - 1, put(Before, Value, [], Rest).
put(At, Value, [Old|Olds], [Old|News]) :- Before is At - 1, put(Before, Value, Olds, News).
% Each outcome with the starts it is read from: so many medals behind.
delayed([], _, _, []).
delayed([o(Medals, Chance)|Outcomes], Cap, Starts, [lag(Chance, Limit, Behind)|Lags]) :-
    Whole is round(Medals * 1.0), Limit is Cap - Medals + Whole, zeros(Whole, Pad), append(Pad, Starts, Behind),
    delayed(Outcomes, Cap, Starts, Lags).
swept(Steps, Steps, _, _, _, [], _, _, []) :- !.
swept(Step, Steps, Whole, Reach, Lags, [Held|Helds], Window, Kernel, Starts) :-
    ( Step =< Whole -> left_held(Lags, Step, 0.0, Held) ; Held = 0.0 ),
    advanced(Lags, Lags1),
    (   Step >= Reach
    ->  dot(Kernel, Window, Coming), ( Step =:= Reach -> Start is 1.0 + Coming ; Start = Coming ), Starts = [Start|Starts1]
    ;   Starts1 = Starts ),
    Window = [_|Window1], Next is Step + 1,
    swept(Next, Steps, Whole, Reach, Lags1, Helds, Window1, Kernel, Starts1).
left_held([], _, Held, Held).
left_held([lag(Chance, Limit, [Start|_])|Lags], Step, Sum, Held) :-
    ( Step < Limit -> Next is Sum + Chance * Start ; Next = Sum ), left_held(Lags, Step, Next, Held).
advanced([], []).
advanced([lag(Chance, Limit, [_|Behind])|Lags], [lag(Chance, Limit, Behind)|Nexts]) :- advanced(Lags, Nexts).
dot([], _, 0.0).
dot([Weight|Weights], [Value|Values], Sum) :- dot(Weights, Values, Rest), Sum is Rest + Weight * Value.
totals([], _, _, _, Ats, Completed, Gained, Ats, Completed, Gained).
totals([Start|Starts], Held, Outcomes, Cap, Ats0, Completed0, Gained0, Ats, Completed, Gained) :-
    (   Start =:= 0
    ->  Ats1 = Ats0, Completed1 = Completed0, Gained1 = Gained0
    ;   Headroom is max(0, Cap - Held), short(Outcomes, Headroom, 0.0, 0.0, Chance, Medals),
        Completion is max(0, 1 - Chance), Gain is Medals + Headroom * Completion,
        Ats1 is Ats0 + Start, Completed1 is Completed0 + Start * Completion, Gained1 is Gained0 + Start * Gain ),
    More is Held + 1, totals(Starts, More, Outcomes, Cap, Ats1, Completed1, Gained1, Ats, Completed, Gained).
short([], _, Chance, Medals, Chance, Medals).
short([o(Each, Share)|Outcomes], Headroom, Chance0, Medals0, Chance, Medals) :-
    ( Each < Headroom -> Chance1 is Chance0 + Share, Medals1 is Medals0 + Each * Share ; Chance1 = Chance0, Medals1 = Medals0 ),
    short(Outcomes, Headroom, Chance1, Medals1, Chance, Medals).
