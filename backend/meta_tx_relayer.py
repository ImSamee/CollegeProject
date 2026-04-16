"""
meta_tx_relayer.py — NeuroLedger EIP-712 Relayer (SEPOLIA EDITION)
"""

import os
from typing import Optional
from web3 import Web3
from fastapi import HTTPException
from pydantic import BaseModel
import threading
from dotenv import load_dotenv

load_dotenv(override=True)

# ── Setup for SEPOLIA ─────────────────────────────────────────────────────
# Pulling your Sepolia RPC from the .env file
RPC_URL = os.environ.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com")
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Operator wallet that pays the gas fees
OPERATOR_KEY  = os.environ.get("OPERATOR_PRIVATE_KEY")
CONTRACT_ADDR = os.environ.get("NEUROLEDGER_CONTRACT_ADDRESS", "").strip()

CHAIN_ID = 11155111 # SEPOLIA CHAIN ID

# ── EIP-712 Domain ────────────────────────────────────────────────────────
DOMAIN = {
    "name":              "NeuroLedger",
    "version":           "3",
    "chainId":           CHAIN_ID,
    "verifyingContract": CONTRACT_ADDR,
}

GRANT_TYPE = {
    "GrantAccess": [
        {"name": "patientId", "type": "bytes32"},
        {"name": "doctor", "type": "address"},
        {"name": "durationSecs", "type": "uint40"},
        {"name": "purposeHash", "type": "bytes32"},
        {"name": "nonce", "type": "uint256"}
    ]
}

REVOKE_TYPE = {
    "RevokeAccess": [
        {"name": "patientId", "type": "bytes32"},
        {"name": "doctor", "type": "address"},
        {"name": "nonce", "type": "uint256"}
    ]
}

# ── Pydantic Models ───────────────────────────────────────────────────────
class MetaGrantRequest(BaseModel):
    patient_id_hex: str
    doctor_address: str
    duration_secs: int
    purpose_hash: str
    signature: str

class MetaRevokeRequest(BaseModel):
    patient_id_hex: str
    doctor_address: str
    signature: str

# ── Helpers ───────────────────────────────────────────────────────────────
def build_grant_typed_data(patient_id_hex: str, doctor: str, durationSecs: int, purposeHash: str, nonce: int):
    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"}
            ],
            "GrantAccess": GRANT_TYPE["GrantAccess"]
        },
        "primaryType": "GrantAccess",
        "domain": DOMAIN,
        "message": {
            "patientId": patient_id_hex,
            "doctor": doctor,
            "durationSecs": durationSecs,
            "purposeHash": purposeHash,
            "nonce": nonce
        }
    }

def build_revoke_typed_data(patient_id_hex: str, doctor: str, nonce: int):
    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"}
            ],
            "RevokeAccess": REVOKE_TYPE["RevokeAccess"]
        },
        "primaryType": "RevokeAccess",
        "domain": DOMAIN,
        "message": {
            "patientId": patient_id_hex,
            "doctor": doctor,
            "nonce": nonce
        }
    }

def parse_sig(signature: str):
    signature = signature.removeprefix("0x")
    r = bytes.fromhex(signature[0:64])
    s = bytes.fromhex(signature[64:128])
    v = int(signature[128:130], 16)
    if v < 27:
        v += 27
    return v, r, s

# ── Nonce Management ──────────────────────────────────────────────────────
nonce_lock = threading.Lock()
local_nonce = [None]

# ── Relayer Logic ─────────────────────────────────────────────────────────
def relay_grant_access(req: MetaGrantRequest, contract, nonce_lock, local_nonce) -> str:
    if not OPERATOR_KEY or not CONTRACT_ADDR:
        raise HTTPException(500, "Missing environment variables (OPERATOR_PRIVATE_KEY or NEUROLEDGER_CONTRACT_ADDRESS)")

    try:
        v, r, s = parse_sig(req.signature)
        acct = w3.eth.account.from_key(OPERATOR_KEY)

        with nonce_lock:
            # Fetch the true pending nonce directly from the Sepolia chain
            chain_nonce = w3.eth.get_transaction_count(acct.address, "pending")

        tx = contract.functions.grantAccessMeta(
            bytes.fromhex(req.patient_id_hex.removeprefix("0x")),
            req.doctor_address,
            req.duration_secs,
            bytes.fromhex(req.purpose_hash.removeprefix("0x")),
            v, r, s
        ).build_transaction({
            'chainId': CHAIN_ID,
            'gas': 200_000,
            'nonce': chain_nonce,
            'maxFeePerGas': w3.to_wei('15', 'gwei'),      
            'maxPriorityFeePerGas': w3.to_wei('2', 'gwei'), 
        })
        
        signed = w3.eth.account.sign_transaction(tx, OPERATOR_KEY)
        tx_hash = w3.to_hex(w3.eth.send_raw_transaction(signed.raw_transaction))
        return tx_hash
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Relay failed: {e}")

def relay_revoke_access(req: MetaRevokeRequest, contract, nonce_lock, local_nonce) -> str:
    if not OPERATOR_KEY or not CONTRACT_ADDR:
        raise HTTPException(500, "Missing environment variables")

    try:
        v, r, s = parse_sig(req.signature)
        acct = w3.eth.account.from_key(OPERATOR_KEY)

        with nonce_lock:
            chain_nonce = w3.eth.get_transaction_count(acct.address, "pending")

        tx = contract.functions.revokeAccessMeta(
            bytes.fromhex(req.patient_id_hex.removeprefix("0x")),
            req.doctor_address,
            v, r, s
        ).build_transaction({
            'chainId': CHAIN_ID,
            'gas': 150_000,
            'nonce': chain_nonce,
            'maxFeePerGas': w3.to_wei('15', 'gwei'),
            'maxPriorityFeePerGas': w3.to_wei('2', 'gwei'),
        })
        
        signed = w3.eth.account.sign_transaction(tx, OPERATOR_KEY)
        tx_hash = w3.to_hex(w3.eth.send_raw_transaction(signed.raw_transaction))
        return tx_hash
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Relay failed: {e}")