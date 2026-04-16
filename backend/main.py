"""
main.py — NeuroLedger v3.1 FastAPI Relayer
"""

import os
import json
import time
from datetime import datetime
import requests
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _SLOWAPI_AVAILABLE = True
except ImportError:
    import sys
    print("\n[NeuroLedger] WARNING: slowapi not installed — rate limiting DISABLED.\n", file=sys.stderr)
    _SLOWAPI_AVAILABLE = False
    def get_remote_address(request): return request.client.host if request.client else "unknown"
    class _NoOpLimiter:
        def __init__(self, key_func=None): pass
        def limit(self, *a, **kw):
            def decorator(fn): return fn
            return decorator
    Limiter = _NoOpLimiter
    class RateLimitExceeded(Exception): pass
    def _rate_limit_exceeded_handler(request, exc): return JSONResponse({"error": "rate limit exceeded"}, status_code=429)

from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from google import genai

load_dotenv(override=True)
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

from meta_tx_relayer import (
    relay_grant_access, relay_revoke_access, build_grant_typed_data, build_revoke_typed_data,
    MetaGrantRequest, MetaRevokeRequest, DOMAIN, w3, nonce_lock, local_nonce
)

SQLALCHEMY_DATABASE_URL = "sqlite:///./neuroledger.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DBMessage(Base):
    __tablename__ = "messages"
    id    = Column(Integer, primary_key=True, index=True)
    text  = Column(String)
    time  = Column(String)
    isDoc = Column(Boolean)
    doctor_address = Column(String) # FIX: Isolates chats per doctor!

class DBRecord(Base):
    __tablename__ = "records"
    id       = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    ipfs_cid = Column(String)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

class VitalsModel(BaseModel):
    heartRate:      Optional[int] = 72
    sleepQuality:   Optional[int] = 88
    cognitiveLoad:  Optional[int] = 42

class ChatMessage(BaseModel):
    text:        str
    is_doctor:   bool
    doctor_name: str = "Dr. Sarah Lee (Neurology)"
    doctor_address: str = "" 
    vitals:      Optional[VitalsModel] = None

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="NeuroLedger V3 Relayer")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the contract globally for the backend
def get_contract():
    contract_address = os.environ.get("NEUROLEDGER_CONTRACT_ADDRESS", "").strip()
    if not contract_address:
        return None
    with open('../blockchain/artifacts/contracts/NeuroLedger_v3.sol/NeuroLedger.json', 'r') as f: 
        contract_json = json.load(f)
    return w3.eth.contract(address=contract_address, abi=contract_json['abi'])

@app.get("/meta/grant-digest")
def get_grant_digest(patientId: str, doctor: str, durationSecs: int, purposeHash: str, nonce: int):
    return build_grant_typed_data(patientId, doctor, durationSecs, purposeHash, nonce)

@app.get("/meta/revoke-digest")
def get_revoke_digest(patientId: str, doctor: str, nonce: int):
    return build_revoke_typed_data(patientId, doctor, nonce)

@app.post("/meta/grant-access")
def submit_grant_access(request: MetaGrantRequest):
    contract = get_contract()
    return {"tx_hash": relay_grant_access(request, contract, nonce_lock, local_nonce)}

@app.post("/meta/revoke-access")
def submit_revoke_access(request: MetaRevokeRequest):
    contract = get_contract()
    return {"tx_hash": relay_revoke_access(request, contract, nonce_lock, local_nonce)}

@app.get("/chat/messages")
def get_messages(doctor_address: str, db: Session = Depends(get_db)):
    messages = db.query(DBMessage).filter(DBMessage.doctor_address == doctor_address).all()
    if not messages:
        welcome_msg = DBMessage(text="Hello Alex. I am your AI Assistant. Your file is secure. How can I help you today?", time=str(int(time.time())), isDoc=True, doctor_address=doctor_address)
        db.add(welcome_msg)
        db.commit()
        messages = [welcome_msg]
    return {"messages": [{"id": m.id, "text": m.text, "time": m.time, "isDoc": m.isDoc} for m in messages]}

@app.post("/chat/send")
@limiter.limit("10/minute")
def send_message(request: Request, msg: ChatMessage, db: Session = Depends(get_db)):
    new_msg = DBMessage(text=msg.text, time=str(int(time.time())), isDoc=msg.is_doctor, doctor_address=msg.doctor_address)
    db.add(new_msg)
    db.commit()
    
    if not msg.is_doctor:
        specialty = {"Dr. Sarah Lee (Neurology)": "senior neurologist", "Dr. Marcus Thorne (Surgery)": "specialised neurosurgeon", "Dr. Elena Vance (Psychiatry)": "clinical psychiatrist"}.get(msg.doctor_name, "medical professional")
        vitals = msg.vitals or VitalsModel()
        
        history_rows = list(reversed(db.query(DBMessage).filter(DBMessage.doctor_address == msg.doctor_address).order_by(DBMessage.id.desc()).limit(8).all()))
        history_text = "\n".join(f"{'Doctor' if m.isDoc else 'Patient'}: {m.text}" for m in history_rows)
        
        system_prompt = f"You are {msg.doctor_name}, a {specialty}. You are talking to your patient Alex.\nAlex's current vitals: Heart Rate {vitals.heartRate} BPM, Sleep Quality {vitals.sleepQuality}%, Cognitive Load {vitals.cognitiveLoad}%.\nKeep your response under 3 sentences, be professional, warm, and medical.\n\nConversation so far:\n{history_text}\n\nAlex just said: '{msg.text}'"
        try: bot_text = client.models.generate_content(model='gemini-2.5-flash', contents=system_prompt).text
        except: bot_text = "I am currently reviewing patient files. I will look at your message shortly."
        
        db.add(DBMessage(text=bot_text, time=str(int(time.time())), isDoc=True, doctor_address=msg.doctor_address))
        db.commit()
        
    return {"status": "success", "messages": [{"id": m.id, "text": m.text, "time": m.time, "isDoc": m.isDoc} for m in db.query(DBMessage).filter(DBMessage.doctor_address == msg.doctor_address).all()]}

@app.post("/records/upload")
@limiter.limit("5/minute")
async def upload_medical_record(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        resp = requests.post("https://api.pinata.cloud/pinning/pinFileToIPFS", headers={"Authorization": f"Bearer {os.environ.get('PINATA_JWT')}"}, files={"file": (file.filename, await file.read())})
        resp.raise_for_status()
        cid = resp.json()["IpfsHash"]
        db.add(DBRecord(filename=file.filename, ipfs_cid=cid))
        db.commit()
        return {"status": "success", "filename": file.filename, "ipfs_cid": cid, "gateway_url": f"https://gateway.pinata.cloud/ipfs/{cid}"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/records")
def get_records(db: Session = Depends(get_db)):
    return {"status": "success", "records": [{"id": r.id, "filename": r.filename, "ipfs_cid": r.ipfs_cid} for r in db.query(DBRecord).all()]}

@app.get("/health")
def health_check(): return {"status": "ok", "provider_connected": w3.is_connected()}

KNOWN_PATIENT_IDS = ["0202020202020202020202020202020202020202020202020202020202020202", "0101010101010101010101010101010101010101010101010101010101010101"]

@app.get("/doctor/patients")
def get_doctor_patients(doctor_address: str, db: Session = Depends(get_db)):
    return {"status": "success", "doctor_address": doctor_address, "patient_ids": [f"0x{pid}" for pid in KNOWN_PATIENT_IDS]}

@app.get("/doctor/records/{patient_id_hex}")
def get_doctor_patient_records(patient_id_hex: str, doctor_address: str, db: Session = Depends(get_db)):
    try: return {"status": "success", "patient_id": f"0x{patient_id_hex}", "doctor_address": doctor_address, "files": [{"id": r.id, "filename": r.filename, "ipfs_cid": r.ipfs_cid} for r in db.query(DBRecord).all()]}
    except Exception as e: return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)