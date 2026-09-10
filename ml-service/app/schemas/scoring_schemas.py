from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class CandidateRequest(BaseModel):
    # Matches the frozen V1 training feature set exactly - the spec's
    # other documented interface fields (severity, emergency_type,
    # distance_meters) are deliberately NOT here, since this model was
    # never trained on them.
    duration_seconds: float = Field(..., ge=0)
    has_known_position: bool


class PredictRequest(BaseModel):
    candidates: List[CandidateRequest]


class PredictionResult(BaseModel):
    index: int
    score: float
    features: Dict[str, Any]


class PredictResponse(BaseModel):
    best_index: int
    scores: List[float]
    predictions: List[PredictionResult]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_features: Optional[List[str]] = None
    error: Optional[str] = None


class ModelInfoResponse(BaseModel):
    loaded: bool
    features: Optional[List[str]] = None
    n_features: Optional[int] = None
    model_type: Optional[str] = None
    model_info: Optional[Dict[str, Any]] = None
    model_path: str
    error: Optional[str] = None


class TrainRequest(BaseModel):
    n_samples: int = 5000
    random_seed: int = 42


class TrainResponse(BaseModel):
    success: bool
    mae: float
    r2: float
    correlation: float
    training_samples: int
    test_samples: int