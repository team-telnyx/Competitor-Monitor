import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { pagesRouter } from "./routes/pages.js";
import { runsRouter } from "./routes/runs.js";
import { competitorsRouter } from "./routes/competitors.js";
import { analyticsRouter } from "./routes/analytics.js";
import { feedbackRouter } from "./routes/feedback.js";
import { productsRouter } from "./routes/products.js";
import { guidanceRouter } from "./routes/guidance.js";
import { removalRequestsRouter } from "./routes/removalRequests.js";
import { policyRouter } from "./routes/policy.js";
import { offeringsRouter } from "./routes/offerings.js";

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
app.use("/api/feedback", feedbackRouter);
app.use("/api/products", productsRouter);
app.use("/api/guidance", guidanceRouter);
app.use("/api/removal-requests", removalRequestsRouter);
app.use("/api/policy", policyRouter);
app.use("/api/offerings", offeringsRouter);

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
