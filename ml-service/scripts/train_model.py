"""
Trains a RandomForestRegressor to approximate the V1 ambulance scoring
function defined in docs/ambulance-scoring-spec.md.

This is DISTILLATION, not outcome-based learning - see the spec's V1/V2
section. The model learns to reproduce a hand-written formula on
synthetic data, not to predict real dispatch outcomes. Do not describe
this model, in code comments or elsewhere, as having "learned" good
dispatch decisions - it has learned to approximate an existing rule.

Frozen V1 training feature set (per spec discussion, confirmed):
    duration_seconds     - the only feature that varies the label
    has_known_position   - the only other feature that affects the label

distance_meters, severity, and emergency_type are deliberately NOT part
of the V1 training vector, even though they're documented as part of
the broader scoring interface - the current rule formula doesn't use
them, so training on them would add pure noise with no signal.
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

FEATURES = ["duration_seconds", "has_known_position"]

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "ambulance_score_model.pkl"

# Generation parameters - assumptions, not part of the frozen spec.
# Documented explicitly so they can be revisited independently of the
# scoring formula itself.
DURATION_RANGE_SECONDS = (0, 3000)  # covers well past the formula's 1800s saturation point
KNOWN_POSITION_PROBABILITY = 0.90    # missing GPS is the edge case, not the norm


def compute_v1_label(duration_seconds: float, has_known_position: bool) -> float:
    """
    Exact, unmodified transcription of the formula in
    docs/ambulance-scoring-spec.md. If this function and
    services/dispatchService.js's scoreAmbulance ever disagree, the spec
    document is the tiebreaker - update both to match it, not each other.
    """
    base_score = 100
    if has_known_position:
        distance_penalty = min(duration_seconds / 45, 40)
    else:
        distance_penalty = 20
    return base_score - distance_penalty


def generate_synthetic_dataset(n_samples: int, random_seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(random_seed)

    duration_seconds = rng.uniform(DURATION_RANGE_SECONDS[0], DURATION_RANGE_SECONDS[1], n_samples)
    has_known_position = rng.random(n_samples) < KNOWN_POSITION_PROBABILITY

    labels = [
        compute_v1_label(d, p) for d, p in zip(duration_seconds, has_known_position)
    ]

    return pd.DataFrame({
        "duration_seconds": duration_seconds,
        "has_known_position": has_known_position.astype(int),  # RF needs numeric, not bool
        "score": labels,
    })


def train_model(n_samples: int, random_seed: int, model_path: Path):
    print(f"Generating {n_samples} synthetic candidates (seed={random_seed})...")
    print(f"  duration_seconds ~ Uniform{DURATION_RANGE_SECONDS}")
    print(f"  has_known_position ~ Bernoulli(p={KNOWN_POSITION_PROBABILITY})")

    df = generate_synthetic_dataset(n_samples, random_seed)

    X = df[FEATURES]
    y = df["score"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=random_seed
    )
    print(f"\nSplit: {len(X_train)} training / {len(X_test)} held-out test")

    model = RandomForestRegressor(n_estimators=200, random_state=random_seed)
    model.fit(X_train, y_train)

    # Evaluated ONLY on the held-out test set - never on training data,
    # per the correction that training-only evaluation proves nothing
    # about generalization.
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
    print(
        "\n  Sanity check: duration_seconds should dominate here. If "
        "has_known_position shows near-zero importance too, that's "
        "actually expected given the formula - it's a hard branch, not "
        "a smooth gradient, so a small forest may lean heavily on "
        "duration once split. If duration_seconds is NOT clearly "
        "dominant, something has drifted from the spec - investigate "
        "before trusting this model."
    )

    model_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model": model,
        "features": FEATURES,
        "n_estimators": 200,
        "random_seed": random_seed,
        "training_samples": len(X_train),
        "test_samples": len(X_test),
        "mae": mae,
        "r2": r2,
        "correlation": correlation,
    }
    joblib.dump(payload, model_path)
    print(f"\nSaved to {model_path}")

    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the V1 ambulance scoring distillation model.")
    parser.add_argument("--n-samples", type=int, default=5000)
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument("--model-path", type=str, default=str(DEFAULT_MODEL_PATH))
    args = parser.parse_args()

    try:
        train_model(args.n_samples, args.random_seed, Path(args.model_path))
    except Exception as e:
        print(f"Training failed: {e}", file=sys.stderr)
        sys.exit(1)