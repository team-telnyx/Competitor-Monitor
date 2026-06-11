import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { pagesRouter } from "./routes/pages.js";
import { runsRouter } from "./routes/runs.js";
import { competitorsRouter } from "./routes/competitors.js";
import { analyticsRouter } from "./routes/analytics.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error", error: (err as Error).message });
  }
});

app.use("/api/pages", pagesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/competitors", competitorsRouter);
app.use("/api/analytics", analyticsRouter);

// Centralized error handler so route throws return JSON, not HTML.
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  },
);

app.listen(config.port, () => {
  console.log(`Dashboard API listening on http://localhost:${config.port}`);
});
