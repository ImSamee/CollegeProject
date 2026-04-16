// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract NeuroLedger {

    // ── EIP-712 Domain ───────────────────────────────────────────────────
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public constant GRANT_TYPEHASH = keccak256(
        "GrantAccess(bytes32 patientId,address doctor,uint40 durationSecs,bytes32 purposeHash,uint256 nonce)"
    );

    bytes32 public constant REVOKE_TYPEHASH = keccak256(
        "RevokeAccess(bytes32 patientId,address doctor,uint256 nonce)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;
    mapping(bytes32 => uint256) public patientNonces;

    // ── Structs ──────────────────────────────────────────────────────────
    struct DiagnosticRecord {
        bytes32 patientId;
        uint256 timestamp;
        bytes32 sessionId;
        bytes32 merkleRoot;
        bytes32 classification;
        uint16  confidenceBps;
        bool    anomalyFlagged;
        address submittedBy;
    }

    struct AccessGrant {
        bytes32 patientId;
        address doctorAddress;
        uint40  grantedAt;
        uint40  expiresAt;
        bool    active;
        bytes32 purposeHash;
    }

    struct PatientProfile {
        bytes32 patientId;
        address controllerAddress;
        uint40  registeredAt;
        bool    active;
        uint32  recordCount;
        bool    consentGiven;
        bytes32 consentHash;
    }

    // ── State ────────────────────────────────────────────────────────────
    address public owner;
    bool    public paused;

    mapping(bytes32 => PatientProfile)  public patients;
    mapping(uint256 => DiagnosticRecord) public records;
    uint256 public totalRecords;

    mapping(bytes32  => uint256[])   private patientRecords;
    mapping(uint256  => AccessGrant) public  accessGrants;
    uint256 public totalGrants;

    mapping(bytes32 => mapping(address => uint256)) private activeGrants;
    mapping(address => bool) public operators;
    mapping(address => bool) public doctors;

    // ── Events ───────────────────────────────────────────────────────────
    event PatientRegistered(bytes32 indexed patientId, address controller);
    event RecordSubmitted(uint256 indexed recordId, bytes32 indexed patientId, bytes32 merkleRoot);
    event AccessGranted(uint256 indexed grantId, bytes32 indexed patientId, address doctor, uint40 expiresAt);
    event AccessRevoked(uint256 indexed grantId, bytes32 indexed patientId, address doctor);
    event MetaTxExecuted(bytes32 indexed patientId, address relayer, string action);

    // ── Modifiers ────────────────────────────────────────────────────────
    modifier onlyOwner()    { require(msg.sender == owner,    "Not owner");    _; }
    modifier onlyOperator() { require(operators[msg.sender],  "Not operator"); _; }
    modifier notPaused()    { require(!paused,                "Paused");       _; }

    // ── Constructor ──────────────────────────────────────────────────────
    constructor() {
        owner            = msg.sender;
        operators[owner] = true;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("NeuroLedger")),
            keccak256(bytes("3")),
            block.chainid,
            address(this)
        ));
    }

    // ── Utilities ────────────────────────────────────────────────────────
    function hashId(string calldata id) external pure returns (bytes32) { return keccak256(abi.encodePacked(id)); }
    function addOperator(address op) external onlyOwner { operators[op] = true; }
    function addDoctor(address doc)  external onlyOwner { doctors[doc]  = true; }
    function pause()   external onlyOwner { paused = true;  }
    function unpause() external onlyOwner { paused = false; }

    // ── Patient Registration ─────────────────────────────────────────────
    function registerPatient(bytes32 patientId, address controller, bytes32 consentHash) external onlyOperator notPaused {
        require(patients[patientId].registeredAt == 0, "Already registered");
        require(controller != address(0), "Zero address");
        patients[patientId] = PatientProfile({
            patientId:         patientId,
            controllerAddress: controller,
            registeredAt:      uint40(block.timestamp),
            active:            true,
            recordCount:       0,
            consentGiven:      true,
            consentHash:       consentHash
        });
        emit PatientRegistered(patientId, controller);
    }

    // ── Record Submission ────────────────────────────────────────────────
    function submitRecord(
        bytes32 patientId, bytes32 sessionId, bytes32 merkleRoot, bytes32 classification,
        uint16  confidenceBps, bool anomalyFlagged
    ) external onlyOperator notPaused returns (uint256 recordId) {
        require(patients[patientId].active,       "Not registered");
        require(patients[patientId].consentGiven, "Consent withdrawn");
        require(confidenceBps <= 10000,           "Invalid confidence");

        recordId = totalRecords;
        records[recordId] = DiagnosticRecord({
            patientId:      patientId,
            timestamp:      block.timestamp,
            sessionId:      sessionId,
            merkleRoot:     merkleRoot,
            classification: classification,
            confidenceBps:  confidenceBps,
            anomalyFlagged: anomalyFlagged,
            submittedBy:    msg.sender
        });
        patientRecords[patientId].push(recordId);
        patients[patientId].recordCount++;
        totalRecords++;
        emit RecordSubmitted(recordId, patientId, merkleRoot);
    }

    // ── EIP-712 Meta-Transaction: grantAccess & revokeAccess ──────────────
    function grantAccessMeta(
        bytes32 patientId, address doctor, uint40 durationSecs, bytes32 purposeHash,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyOperator notPaused returns (uint256 grantId) {
        require(doctors[doctor], "Not registered doctor");
        require(patients[patientId].active, "Patient not registered");

        bytes32 structHash = keccak256(abi.encode(GRANT_TYPEHASH, patientId, doctor, durationSecs, purposeHash, patientNonces[patientId]));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        
        require(signer != address(0), "Invalid signature");
        require(signer == patients[patientId].controllerAddress, "Signature not from patient controller");

        patientNonces[patientId]++;
        grantId = _doGrantAccess(patientId, doctor, durationSecs, purposeHash);
        emit MetaTxExecuted(patientId, msg.sender, "grantAccess");
    }

    function revokeAccessMeta(
        bytes32 patientId, address doctor, uint8 v, bytes32 r, bytes32 s
    ) external onlyOperator notPaused {
        require(patients[patientId].active, "Patient not registered");

        bytes32 structHash = keccak256(abi.encode(REVOKE_TYPEHASH, patientId, doctor, patientNonces[patientId]));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);

        require(signer != address(0), "Invalid signature");
        require(signer == patients[patientId].controllerAddress, "Signature not from patient controller");

        patientNonces[patientId]++;
        _doRevokeAccess(patientId, doctor);
        emit MetaTxExecuted(patientId, msg.sender, "revokeAccess");
    }

    function grantAccess(bytes32 patientId, address doctor, uint40 durationSecs, bytes32 purposeHash) external notPaused returns (uint256) {
        require(patients[patientId].controllerAddress == msg.sender, "Not patient");
        require(patients[patientId].active, "Inactive");
        require(doctors[doctor], "Not registered doctor");
        return _doGrantAccess(patientId, doctor, durationSecs, purposeHash);
    }

    function revokeAccess(bytes32 patientId, address doctor) external notPaused {
        require(patients[patientId].controllerAddress == msg.sender, "Not patient");
        require(patients[patientId].active, "Inactive");
        _doRevokeAccess(patientId, doctor);
    }

    function _doGrantAccess(bytes32 patientId, address doctor, uint40 durationSecs, bytes32 purposeHash) internal returns (uint256 grantId) {
        uint40 expiry = durationSecs > 0 ? uint40(block.timestamp) + durationSecs : type(uint40).max;
        grantId = totalGrants;
        accessGrants[grantId] = AccessGrant({ patientId: patientId, doctorAddress: doctor, grantedAt: uint40(block.timestamp), expiresAt: expiry, active: true, purposeHash: purposeHash });
        activeGrants[patientId][doctor] = grantId;
        totalGrants++;
        emit AccessGranted(grantId, patientId, doctor, expiry);
    }

    function _doRevokeAccess(bytes32 patientId, address doctor) internal {
        uint256 grantId = activeGrants[patientId][doctor];
        require(accessGrants[grantId].active, "No active grant");
        accessGrants[grantId].active = false;
        emit AccessRevoked(grantId, patientId, doctor);
    }

    // ── DOCTOR PORTAL RECORD FETCHING ────────────────────────────────────
    function hasAccess(bytes32 patientId, address doctor) public view returns (bool) {
        uint256 grantId = activeGrants[patientId][doctor];
        AccessGrant memory g = accessGrants[grantId];
        return g.active && block.timestamp <= g.expiresAt;
    }

    function getPatientRecords(bytes32 _patientId, uint256 _offset, uint256 _limit) external view returns (uint256[] memory page, uint256 total) {
        require(msg.sender == patients[_patientId].controllerAddress || hasAccess(_patientId, msg.sender) || msg.sender == owner, "Not authorized to view records");
        uint256[] memory allRecords = patientRecords[_patientId];
        total = allRecords.length;
        if (_offset >= total) return (new uint256[](0), total);
        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 size = end - _offset;
        page = new uint256[](size);
        for (uint256 i = 0; i < size; i++) page[i] = allRecords[_offset + i];
        return (page, total);
    }

    function getRecord(uint256 recordId) external view returns (
        bytes32 patientId, uint256 timestamp, bytes32 merkleRoot, bytes32 classification, uint16 confidenceBps, bool anomalyFlagged, address submittingDoctor
    ) {
        DiagnosticRecord memory rec = records[recordId];
        require(patients[rec.patientId].controllerAddress == msg.sender || hasAccess(rec.patientId, msg.sender) || msg.sender == owner, "Access denied");
        return (rec.patientId, rec.timestamp, rec.merkleRoot, rec.classification, rec.confidenceBps, rec.anomalyFlagged, rec.submittedBy);
    }

    function verifyMerkleProof(uint256 recordId, bytes32 dataHash, bytes32 shapHash) external view returns (bool) {
        bytes32 storedRoot = records[recordId].merkleRoot;
        bytes32 leafA = keccak256(abi.encodePacked(dataHash));
        bytes32 leafB = keccak256(abi.encodePacked(shapHash));
        bytes32 computed = leafA <= leafB ? keccak256(abi.encodePacked(leafA, leafB)) : keccak256(abi.encodePacked(leafB, leafA));
        return computed == storedRoot;
    }

    function buildGrantDigest(bytes32 patientId, address doctor, uint40 durationSecs, bytes32 purposeHash) external view returns (bytes32 digest) {
        bytes32 structHash = keccak256(abi.encode(GRANT_TYPEHASH, patientId, doctor, durationSecs, purposeHash, patientNonces[patientId]));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function buildRevokeDigest(bytes32 patientId, address doctor) external view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(REVOKE_TYPEHASH, patientId, doctor, patientNonces[patientId]));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function getTotalRecords() external view returns (uint256) { return totalRecords; }
    function getTotalGrants()  external view returns (uint256) { return totalGrants;  }
    function getPatientNonce(bytes32 patientId) external view returns (uint256) { return patientNonces[patientId]; }
}