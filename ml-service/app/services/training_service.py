"""
Wraps scripts/train_model.py so /api/train can trigger a real retrain
without duplicating the training logic - the script remains the single
source of truth for how training happens, this just calls into it.
"""

import sys
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"


class TrainingService:
    def __init__(self, model_path: str = None):
        self.model_path = model_path
        self._training = False

    def is_training(self) -> bool:
        return self._training

    def train(self, n_samples: int, random_seed: int) -> dict:
        if self._training:
            raise RuntimeError("Training already in progress")

        self._training = True
        try:
            if str(SCRIPTS_DIR) not in sys.path:
                sys.path.insert(0, str(SCRIPTS_DIR))

            import train_model as train_module

            path = Path(self.model_path) if self.model_path else train_module.DEFAULT_MODEL_PATH
            payload = train_module.train_model(n_samples, random_seed, path)
            return payload
        finally:
            self._training = False


_training_service_instance: TrainingService = None


def get_training_service(model_path: str = None) -> TrainingService:
    global _training_service_instance
    if _training_service_instance is None:
        _training_service_instance = TrainingService(model_path)
    return _training_service_instance