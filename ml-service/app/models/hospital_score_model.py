"""
Model wrapper for the V1 hospital scoring distillation model.
Independent from ambulance_score_model.py by design - separate model,
separate spec, separate feature contract. Mirrors its structure
deliberately so both are easy to read side by side, not because they
share code.

Frozen V1 feature contract (docs/hospital-scoring-spec.md):
  distance_penalty, severity, specialty_match, available_beds
"""

from pathlib import Path
import joblib
import pandas as pd

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "hospital_score_model.pkl"

FEATURES = ["distance_penalty", "severity", "specialty_match", "available_beds"]


class HospitalScoreModel:
    def __init__(self, model_path: str = None):
        self.model_path = Path(model_path) if model_path else DEFAULT_MODEL_PATH
        self.model = None
        self.features = FEATURES
        self._metadata = {}
        self._loaded = False
        self._error = None

    def load(self, force_reload: bool = False) -> bool:
        if self._loaded and not force_reload:
            return True
        try:
            if not self.model_path.exists():
                self._error = f"Model file not found at {self.model_path}"
                self._loaded = False
                return False

            payload = joblib.load(self.model_path)
            self.model = payload["model"]
            self.features = payload.get("features", FEATURES)
            self._metadata = {
                "n_estimators": payload.get("n_estimators"),
                "random_seed": payload.get("random_seed"),
                "training_samples": payload.get("training_samples"),
                "test_samples": payload.get("test_samples"),
                "mae": payload.get("mae"),
                "r2": payload.get("r2"),
                "correlation": payload.get("correlation"),
            }
            self._loaded = True
            self._error = None
            return True
        except Exception as e:
            self._error = str(e)
            self._loaded = False
            return False

    def is_loaded(self) -> bool:
        return self._loaded

    def get_info(self) -> dict:
        return {
            "loaded": self._loaded,
            "features": self.features if self._loaded else None,
            "n_features": len(self.features) if self._loaded else None,
            "model_type": "RandomForestRegressor" if self._loaded else None,
            "model_info": self._metadata if self._loaded else None,
            "model_path": str(self.model_path),
            "error": self._error,
        }

    def predict(self, candidates: list) -> tuple:
        if not self._loaded:
            raise RuntimeError("Hospital model is not loaded.")
        if not candidates:
            raise ValueError("candidates list is empty")

        try:
            rows = [
                {
                    "distance_penalty": c["distance_penalty"],
                    "severity": c["severity"],
                    "specialty_match": int(bool(c["specialty_match"])),
                    "available_beds": c["available_beds"],
                }
                for c in candidates
            ]
            X = pd.DataFrame(rows)[self.features]
        except KeyError as e:
            raise ValueError(f"Candidate missing required feature: {e}")

        scores = self.model.predict(X)
        best_index = int(scores.argmax())

        predictions = [
            {"index": i, "score": float(scores[i]), "features": candidates[i]}
            for i in range(len(candidates))
        ]

        return best_index, list(scores), predictions


_model_instance: HospitalScoreModel = None


def get_hospital_model(model_path: str = None, reset: bool = False) -> HospitalScoreModel:
    global _model_instance
    if _model_instance is None or reset:
        _model_instance = HospitalScoreModel(model_path)
    return _model_instance