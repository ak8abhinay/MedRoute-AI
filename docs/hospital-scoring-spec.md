# Hospital Suitability Scoring Specification

Version 1 — distillation target. Companion to
`docs/ambulance-scoring-spec.md`, same governing rule: this document is
the single source of truth. Both `services/hospitalService.js`
(JavaScript, rule-based, production) and `ml-service/scripts/
train_hospital_model.py` (Python, trains a model to approximate this
same function) must conform to this spec exactly.

## What this scores

Given one emergency and one candidate hospital, produces a single
continuous suitability score. Higher is better.

## Features supplied to the model (input vector)

Unlike ambulance scoring, every one of these genuinely affects the V1
label - there are no noise features to exclude here.

| Field | Type | Encoding | Source |
|---|---|---|---|
| `distance_penalty` | float | direct value | `min(duration_seconds/45, 40)` when routed, `min(straight_line_m/500, 40)` otherwise - see note below |
| `severity` | ordinal | Low=0, Medium=1, High=2 | Emergency.severity |
| `specialty_match` | boolean | 0/1 | `hospital.specialties.includes(emergency.emergency_type)` |
| `available_beds` | float | direct value, pre-capped at 20 (see formula) | Hospital.available_beds |

`emergency_type` itself is NOT a direct model input - it's already been
collapsed into the boolean `specialty_match` before scoring happens,
by the same eligibility-style check the rule scorer performs. This
avoids the one-hot-encoding question entirely for V1, since the model
never sees the raw category, only whether it matched. A future version
could pass the raw one-hot `emergency_type` instead and let the model
learn matching itself - deliberately not done for V1, kept as narrow as
what the live formula actually computes.

## Formula (verified, unmodified transcription of the live scorer)

## A real asymmetry, worth stating explicitly (this is what makes hospital scoring harder than ambulance scoring)

Unlike ambulance scoring's clean single distance-based penalty, this
formula has a genuine severity × specialty-match INTERACTION - the
bonus/penalty for the exact same specialty_match value depends on which
severity tier the emergency falls in. This is a real reason a linear
model would badly underfit this function; it's also exactly the kind of
pattern a tree-based model (RandomForest) should recover cleanly, since
trees split naturally on exactly this kind of "if severity=High AND
specialty_match=false, apply penalty X" rule. Worth watching for in the
trained model's feature importance and, ideally, a partial-dependence
check on severity × specialty_match jointly - not just each feature
scored independently.

## distance_penalty - a modeling simplification, named honestly

The real service computes this two different ways depending on whether
a candidate got a real OSRM route or fell back to straight-line
distance (see hospitalService.js's scoreByRoute vs scoreByStraightLine).
For V1 training, distance_penalty is treated as a single pre-computed
input feature, not re-derived from raw duration/distance separately -
this sidesteps needing two different distance representations in the
training data. The tradeoff: the model can't distinguish "close by real
road" from "close by straight line" if the same penalty value arises
both ways, which the real system's dual-path scoring can, in principle,
tell apart. Named here rather than silently accepted.

## Effective output range

Not fixed. With High severity + specialty match + full beds:
100 - 0 + 35 + 20 = up to 155. With High severity + mismatch + zero
beds: 100 - 40 - 15 + 0 = as low as 45. A genuinely wider range than
ambulance scoring's tight 60-100 band - worth expecting a less
saturated, more varied score distribution in training data here.

## V1 vs V2

Same boundary as the ambulance spec: V1 distills this exact formula on
synthetic data. V2 would retrain on real outcomes once volume exists,
potentially replacing the boolean specialty_match with the raw
emergency_type one-hot, letting the model discover matching patterns
the current hand-written table doesn't encode (e.g. partial specialty
relevance, not just binary match/no-match).

## Explicitly NOT yet part of this spec

- Real-time bed availability feed (still manually updated).
- Ambulance scoring - see the companion spec; different formula,
  different feature set, already built and proven separately.