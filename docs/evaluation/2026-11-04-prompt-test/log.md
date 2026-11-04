# Node builder prompt test log

Package: C:\Users\hp\AppData\Local\Temp\claude\a4b37ef9899b278f\b24e3d2c-c0f0-4671-9589-93c630974442\scratchpad\prompt-test\package.json

## Steps
- Step 1 interview: designer could not chat, so the single block of answers was used. Question, category (STRC), stage (massing), human judgement, limits and credits were covered. Not covered: inputs (I mapped them myself to Layer 0), parameters (none needed), handle for id (not given; derived "test-student" from the name, my choice), the "what's bad" for efficiency, and a source for the efficiency threshold.
- Step 2 flags: slenderness good 8 / bad 10 = unverified (instructor lecture, not checked, no page). Efficiency = unresolved. Read-back for confirmation was impossible (no chat); noted.
- Step 3 spec: built mentally; the "Shall I build?" confirmation could not be asked, so I treated the one-block answers as the yes. Noted.
- Step 4 package: written. Slenderness expression `tower.height / tower.minSide` (equals tower.slenderness; kept explicit to match the designer's definition). Efficiency reads tower.netToGross.
- Step 5 tests: 4 slenderness tests across all 3 fixtures (incl. a warn at 9.357), 2 net_to_gross tests (unknown). No fixture exceeds 10 so Fail is untested.
- Step 6 hand over: not performed beyond writing the file.

## "Just pick" a threshold
Rule 2 says never invent; suggestions must be labelled mine and asked first, but step 1.6 says "Don't offer example numbers yourself". I could not ask, so I set efficiency to `unresolved` with no good/bad and wrote in the source label that none was supplied. I offered no number.

## Wind-tunnel belief ("over 6 always needs a wind tunnel test")
Not encoded as a threshold or metric. falseAssumptions needs a correction and source, and I have neither (I don't know it is false, and may not invent a correction). The designer did not say it was wrong. I recorded it in `limits` as an unchecked belief that is not encoded. Rule 4 and the flags table don't cover "belief not yet known to be wrong or right".

## Checker output
All 6 tests ok; "Ready to import". Values: slenderness 6.20 pass, 4 pass, 9.36 warn, 6.25 pass; net_to_gross unknown (0.68, 0.76, 0.8, 0.73).

## Problems in the prompt
1. No rule for when the designer cannot answer or the conversation is single-shot. "Ask, then wait" and "Continue only on a clear yes" (step 3) cannot be followed. Quote: "Shall I build the package from this, or change something? Continue only on a clear yes."
2. Contradiction on suggestions: rule 2 "Label any suggestion of yours as yours, and ask first" vs step 1.6 "Don't offer example numbers yourself". Unclear what to do when the designer says "pick one for me".
3. Unverified beliefs: rule 4 "Keep wrong beliefs visible in falseAssumptions with the correction and its source" has no home for a belief that is unchecked (wind tunnel). Forcing it in would need an invented correction/source.
4. Handle for the id: step 1.11 asks for "a short handle" but the designer gave only a name; no instruction on deriving one.
5. Verified/unverified for a good-bad pair from a lecture: "up to 8 comfortable, above 10 expensive" maps to good/bad, but "expensive" is not "fail"; and "Fail needs a sourced limit" is ambiguous when the source is unverified (a Fail can then rest on an unchecked source). Also tower.slenderness and tower.minSide both exist, giving two ways to write the same formula.
6. Layer 0 netToGross is core-only, so it only roughly matches the designer's "net over gross"; the prompt doesn't say whether to warn the designer or how.
7. Step 5 says "at least two" designs but the fixtures can't exercise Fail for thresholds above ~9.4, and tests with state "unknown" for unresolved thresholds are not mentioned.
8. Step 4 says "No JSON until step 4" but the output instruction to the designer at step 6 is fine; minor: the prompt says run nothing, so the checker is not mentioned in the prompt itself (the task asked for it separately).
