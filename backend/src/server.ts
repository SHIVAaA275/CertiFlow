
import "dotenv/config";
import express from "express";
import cors from "cors";
import prisma from "./config/prisma";
import authRoutes from "./routes/auth.routes";
import batchRoutes from "./routes/batch.routes";
import candidateRoutes from "./routes/candidate.routes";
import approvalRoutes from "./routes/approval.routes";
import certificateRoutes from "./routes/certificate.routes";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));

app.use(express.json());

app.use("/api/auth", authRoutes);

app.use("/api/batches", batchRoutes);

app.use("/api/batches", candidateRoutes);

app.use("/api/batches", approvalRoutes);

app.use("/api", certificateRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "CertiFlow API is running"
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      database: "connected"
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      database: "disconnected"
    });
  }
});

async function startServer() {
  try {
    await prisma.$connect();

    console.log("PostgreSQL connected successfully");

    app.listen(PORT, () => {
      console.log(`CertiFlow backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error);
    process.exit(1);
  }
}

startServer();
