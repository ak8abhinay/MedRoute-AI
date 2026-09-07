# Project Decisions

This document records important architectural and ML design decisions
made during the development of MedRoute-AI, including the reasoning
behind them.

---

## August 2026 — Ambulance ML Strategy

### Decision

Build ambulance ML using a two-stage approach:

1. V1 — distillation of the existing rule-based ambulance scorer.
2. V2 — outcome-based ML using real dispatch/simulator data.

### Why

The system currently has limited real-world outcome data. Training an
outcome-based model now would not provide enough meaningful data for
training and evaluation.

V1 allows the ML pipeline to be built and tested using synthetic data
while remaining honest about what the model has actually learned.

V1 is therefore a distillation model: it learns to approximate the
existing hand-written scoring function rather than learning from real
dispatch outcomes.

Once sufficient real dispatch data has been generated, V2 can replace
the synthetic labels with outcome-based labels.

---

## August 2026 — Ambulance ML Before Hospital ML

### Decision

Build and validate ambulance ML before introducing ML for hospital
selection.

### Why

Ambulance selection and hospital selection are separate scoring
problems. Starting with ambulance selection keeps the first ML problem
smaller and makes the training, serving, fallback, and evaluation
pipeline easier to validate.

After ambulance ML is proven, a separate hospital scoring specification
and ML model will be developed.

---

## August 2026 — V1 Training Features

### Decision

V1 Random Forest training uses only:

- `duration_seconds`
- `has_known_position`

### Why

These are the only inputs that currently influence the V1 ambulance
scoring formula.

Although the dispatch system has additional information such as
distance, severity, and emergency type, those values do not affect the
current ambulance rule-based label.

Including them in V1 training would add features with no signal.

Future outcome-based training may use additional features if real
outcomes demonstrate that they are useful.

---

## August 2026 — Random Forest

### Decision

Use `RandomForestRegressor` for the V1 ambulance model.

### Why

The target is a continuous ambulance suitability score, making this a
regression problem.

Random Forest is appropriate for the small initial dataset, handles
non-linear relationships, and provides feature-importance information
that is useful for validating the V1 distillation.

The model is also consistent with the ML approach used in the reference
project.

---

## August 2026 — Synthetic Training Data

### Decision

Generate synthetic training examples for V1 using the exact ambulance
scoring formula defined in:

`docs/ambulance-scoring-spec.md`

### Generation assumptions

- `duration_seconds`: uniformly generated from 0–3000 seconds.
- `has_known_position`: 90% true, 10% false.
- Random seed: fixed for reproducibility.

### Why

The formula's penalty reaches its maximum at 1800 seconds. Generating
only the shorter durations observed in current tests would not expose
the model to the saturation behavior.

The 90/10 position distribution reflects the expectation that missing
ambulance position data is an edge case.

These generation parameters are training assumptions and are separate
from the scoring specification.

---

## August 2026 — Train/Test Evaluation

### Decision

Evaluate the model only on a held-out test set.

### Why

Evaluating on the same data used for training does not demonstrate
generalization.

V1 uses an 80/20 train/test split and reports:

- MAE
- R²
- correlation

Feature importance is also inspected as a sanity check against the
scoring specification.

---

## August 2026 — ML Failure Fallback

### Decision

The existing rule-based ambulance scorer remains the fallback if the ML
service is unavailable or returns an invalid prediction.

### Why

ML must improve the system without making ambulance dispatch dependent
on the availability of a separate ML service.

If FastAPI is unavailable, times out, or fails, dispatch should continue
using the existing deterministic scoring logic.

This preserves the current working behavior while allowing ML to be
introduced incrementally.