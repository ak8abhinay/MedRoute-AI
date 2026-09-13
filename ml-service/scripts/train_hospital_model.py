"""
Trains a RandomForestRegressor to approximate the V1 hospital scoring
function defined in docs/hospital-scoring-spec.md.

DISTILLATION, not outcome-based learning - same framing as
train_model.py's ambulance scorer. This model learns to reproduce a
hand-written formula on synthetic data.

Frozen V1 training feature set (per the hospital spec):
    distance_penalty   - pre-computed, not re-derived from raw distance/duration
    severity            - ordinal: Low=0, Medium=1, High=2
    specialty_match     - boolean: 0/1
    available_beds      - pre-capped at 20, matching the formula's own min()

Unlike the ambulance scorer, every one of these genuinely affects the
label - there's no noise feature being deliberately excluded here.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

FEATURES = ["distance_penalty", "severity", "specialty_match", "available_beds"]
SEVERITY_ORDER = ["Low", "Medium", "High"]  # index = ordinal value

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "hospital_score_model.pkl"

# Generation parameters - assumptions, not part of the frozen spec.
DISTANCE_PENALTY_RANGE = (0, 40)     # matches the formula's own min(x, 40) cap
RAW_BEDS_RANGE = (0, 100)            # realistic hospital bed counts before capping

SEVERITY_WEIGHTS = {
    "High":   {"matchBonus": 35, "mismatchPenalty": 15},
    "Medium": {"matchBonus": 20, "mismatchPenalty": 0},
    "Low":    {"matchBonus": 10, "mismatchPenalty": 0},
}


def compute_v1_label(distance_penalty: float, severity_ordinal: int, specialty_match: bool, available_beds_capped: float) -> float:
    """
    Exact, unmodified transcription of the formula in
    docs/hospital-scoring-spec.md. If this function and
    services/hospitalService.js's composeScore ever disagree, the spec
    document is the tiebreaker.
    """
    severity = SEVERITY_ORDER[severity_ordinal]
    weights = SEVERITY_WEIGHTS[severity]

    specialty_score = weights["matchBonus"] if specialty_match else -weights["mismatchPenalty"]

    return 100 - distance_penalty + specialty_score + available_beds_capped


def generate_synthetic_dataset(n_samples: int, random_seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(random_seed)

    distance_penalty = rng.uniform(*DISTANCE_PENALTY_RANGE, n_samples)
    severity = rng.integers(0, 3, n_samples)  # 0, 1, or 2
    specialty_match = rng.random(n_samples) < 0.5  # no real-world prior to bias this toward
    raw_beds = rng.uniform(*RAW_BEDS_RANGE, n_samples)
    available_beds_capped = np.minimum(raw_beds, 20)

    labels = [
        compute_v1_label(dp, sev, sm, beds)
        for dp, sev, sm, beds in zip(distance_penalty, severity, specialty_match, available_beds_capped)
    ]

    return pd.DataFrame({
        "distance_penalty": distance_penalty,
        "severity": severity,
        "specialty_match": specialty_match.astype(int),
        "available_beds": available_beds_capped,
        "score": labels,
    })


def check_severity_specialty_interaction(model):
    """
    The real diagnostic for this model, beyond aggregate R² - confirms
    the tree ensemble actually recovered the severity x specialty_match
    INTERACTION (the bonus/penalty for the same specialty_match value
    differs by severity tier), not just an average effect across all
    severities. Holds distance_penalty and available_beds fixed at
    neutral values (0 and 20) so only the interaction term varies.
    """
    print("\n--- Severity x specialty_match interaction check ---")
    print("(distance_penalty=0, available_beds=20 held fixed - isolates the interaction term)\n")

    rows = []
    for severity_ordinal, severity_name in enumerate(SEVERITY_ORDER):
        for specialty_match in [0, 1]:
            expected = compute_v1_label(0, severity_ordinal, bool(specialty_match), 20)
            X = pd.DataFrame([{
                "distance_penalty": 0, "severity": severity_ordinal,
                "specialty_match": specialty_match, "available_beds": 20,
            }])[FEATURES]
            predicted = model.predict(X)[0]
            diff = abs(predicted - expected)
            rows.append((severity_name, bool(specialty_match), expected, predicted, diff))
            print(f"  {severity_name:7s} | match={bool(specialty_match)!s:5s} | expected={expected:6.2f} | predicted={predicted:6.2f} | diff={diff:.3f}")

    max_diff = max(r[4] for r in rows)
    if max_diff > 2.0:
        print(f"\n  WARNING: max diff {max_diff:.3f} is large - model may not have cleanly learned the interaction.")
    else:
        print(f"\n  OK: max diff {max_diff:.3f} - interaction recovered cleanly across all six combinations.")


def train_model(n_samples: int, random_seed: int, model_path: Path):
    print(f"Generating {n_samples} synthetic hospital candidates (seed={random_seed})...")

    df = generate_synthetic_dataset(n_samples, random_seed)

    X = df[FEATURES]
    y = df["score"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=random_seed)
    print(f"Split: {len(X_train)} training / {len(X_test)} held-out test")

    model = RandomForestRegressor(n_estimators=200, random_state=random_seed)
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    r2 = r2_score(y_test, predictions)
    correlation = float(np.corrcoef(y_test, predictions)[0, 1])

    print("\n--- Evaluation (held-out test set) ---")
    print(f"MAE:         {mae:.4f}")
    print(f"R²:          {r2:.4f}")
    print(f"Correlation: {correlation:.4f}")

    print("\n--- Feature importance ---")
    for feature, importance in zip(FEATURES, model.feature_importances_):
        print(f"  {feature}: {importance:.4f}")

    check_severity_specialty_interaction(model)

    model_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model": model, "features": FEATURES, "n_estimators": 200,
        "random_seed": random_seed, "training_samples": len(X_train),
        "test_samples": len(X_test), "mae": mae, "r2": r2, "correlation": correlation,
    }
    joblib.dump(payload, model_path)
    print(f"\nSaved to {model_path}")

    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the V1 hospital scoring distillation model.")
    parser.add_argument("--n-samples", type=int, default=5000)
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument("--model-path", type=str, default=str(DEFAULT_MODEL_PATH))
    args = parser.parse_args()

    try:
        train_model(args.n_samples, args.random_seed, Path(args.model_path))
    except Exception as e:
        print(f"Training failed: {e}", file=sys.stderr)
        sys.exit(1)