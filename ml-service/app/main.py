import logging

from fastapi import FastAPI, HTTPException

from app.schemas.scoring_schemas import (
    PredictRequest, PredictResponse, PredictionResult,
    HospitalPredictRequest,
    HealthResponse, ModelInfoResponse, TrainRequest, TrainResponse,
)
from app.models.ambulance_score_model import get_model
from app.models.hospital_score_model import get_hospital_model
from app.services.training_service import get_training_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MedRoute AI - ML Scoring Service (V1 - distillation)")

ambulance_model = get_model()
ambulance_model.load()

hospital_model = get_hospital_model()
hospital_model.load()


@app.get("/api/health", response_model=HealthResponse)
def health():
    # Reports the ambulance model's status for backward compatibility
    # with mlService.js's existing health expectations - both models'
    # individual status is also available via /api/model/info below.
    info = ambulance_model.get_info()
    hospital_info = hospital_model.get_info()
    return HealthResponse(
        status="healthy" if (info["loaded"] and hospital_info["loaded"]) else "degraded",
        model_loaded=info["loaded"],
        model_features=info.get("features"),
        error=info.get("error") or hospital_info.get("error"),
    )


@app.get("/api/model/info", response_model=ModelInfoResponse)
def model_info():
    return ModelInfoResponse(**ambulance_model.get_info())


@app.get("/api/model/info/hospital", response_model=ModelInfoResponse)
def hospital_model_info():
    return ModelInfoResponse(**hospital_model.get_info())


@app.post("/api/predict/ambulance", response_model=PredictResponse)
def predict_ambulance(request: PredictRequest):
    try:
        candidates = [c.dict() for c in request.candidates]
        best_idx, scores, predictions = ambulance_model.predict(candidates)
        return PredictResponse(
            best_index=best_idx,
            scores=[round(float(s), 4) for s in scores],
            predictions=[PredictionResult(**p) for p in predictions],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/predict/hospital", response_model=PredictResponse)
def predict_hospital(request: HospitalPredictRequest):
    try:
        candidates = [c.dict() for c in request.candidates]
        best_idx, scores, predictions = hospital_model.predict(candidates)
        return PredictResponse(
            best_index=best_idx,
            scores=[round(float(s), 4) for s in scores],
            predictions=[PredictionResult(**p) for p in predictions],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/train", response_model=TrainResponse)
def train(request: TrainRequest):
    training_service = get_training_service()
    if training_service.is_training():
        raise HTTPException(status_code=409, detail="Training already in progress")

    try:
        payload = training_service.train(request.n_samples, request.random_seed)
        ambulance_model.load(force_reload=True)
        return TrainResponse(
            success=True, mae=payload["mae"], r2=payload["r2"], correlation=payload["correlation"],
            training_samples=payload["training_samples"], test_samples=payload["test_samples"],
        )
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))