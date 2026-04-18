# NeuroLedger_v3 Setup & Installation Guide

This guide provides step-by-step instructions to install and run the **NeuroLedger_v3** project on a new machine using **VS Code**.

## 📋 Prerequisites

Ensure the following are installed on your system:
- **Node.js**: [Download](https://nodejs.org/) (Version 18 or higher recommended)
- **Python**: [Download](https://www.python.org/) (Version 3.9 or higher recommended)
- **Git**: [Download](https://git-scm.com/)
- **VS Code**: [Download](https://code.visualstudio.com/)

---

## 🚀 Step 1: Project Setup

1. Open **VS Code**.
2. Clone or copy the project folder to your machine.
3. Open the project folder in VS Code: `File > Open Folder... > NeuroLedger_v3`.

---

## ⛓️ Step 2: Blockchain Module

The blockchain module uses **Hardhat** for local development and smart contract management.

1. Open a new terminal in VS Code (`Ctrl+` ` ` or `Terminal > New Terminal`).
2. Navigate to the blockchain directory:
   ```bash
   cd blockchain
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Configure environment variables:
   - Copy `.env.example` to a new file named `.env`.
   - Fill in your `PRIVATE_KEY` and other RPC details as needed.
5. Compile the smart contracts:
   ```bash
   npx hardhat compile
   ```
6. (Optional) Deploy to a local network or Sepolia:
   ```bash
   npx hardhat run scripts/deploy.js --network <network_name>
   ```

---

## ⚙️ Step 3: Backend Module (FastAPI)

The backend is built with **Python** and **FastAPI**.

1. Open a **second** terminal window in VS Code.
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Create a Virtual Environment:
   - **Windows**: `python -m venv venv`
   - **Mac/Linux**: `python3 -m venv venv`
4. Activate the Virtual Environment:
   - **Windows**: `venv\Scripts\activate`
   - **Mac/Linux**: `source venv/bin/activate`
5. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
6. Configure environment variables:
   - Copy `.env.example` to a new file named `.env`.
   - Add your `GEMINI_API_KEY`, `SEPOLIA_RPC_URL`, `OPERATOR_PRIVATE_KEY`, `NEUROLEDGER_CONTRACT_ADDRESS`, `PINATA_JWT`.
   - Set `FRONTEND_ORIGIN` to the URL of your frontend (default: `http://localhost:5174`).
7. Run the backend server:
   ```bash
   python main.py
   # or
   uvicorn main:app --reload
   ```

---

## 💻 Step 4: Frontend Module (React + Vite)

The frontend is a modern **React** application powered by **Vite** and **Tailwind CSS**.

1. Open a **third** terminal window in VS Code.
2. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Configure environment variables:
   - Copy `.env.example` to a new file named `.env`.
   - Update `VITE_CONTRACT_ADDRESS` if you deployed a new contract.
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5174`).

---

## 🛠️ Troubleshooting

- **Node Version**: If you encounter errors during `npm install`, ensure you are using a compatible Node.js version.
- **Python Imports**: If a package is missing, double-check that you activated the virtual environment before running `pip install`.
- **Port Conflicts**: If port 8002 (Backend) or 5174 (Frontend) is already in use, you may need to close the existing process or change the port in the configuration.
- **Wallet Connection**: Ensure your Metamask (or equivalent) is set to the correct network (e.g., Sepolia) to interact with the blockchain features.

---

> [!TIP]
> **Pro Tip**: Use the Multi-Terminal feature in VS Code to keep all three services (Blockchain, Backend, Frontend) running simultaneously!
