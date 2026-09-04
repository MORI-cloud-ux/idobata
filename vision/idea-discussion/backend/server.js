import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import themeRoutes from "./routes/themeRoutes.js"; // Import theme routes
import { callLLM } from "./services/llmService.js"; // Import LLM service

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Connection ---
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.warn("Warning: MONGODB_URI is not defined in the .env file.");
  console.warn("Continuing without MongoDB for testing purposes");
}

try {
  await mongoose.connect(mongoUri || "mongodb://localhost:27017/idobata");
  console.log("MongoDB connected successfully.");
} catch (err) {
  console.error("MongoDB connection error:", err);
  console.warn("Continuing without MongoDB for testing purposes");
}

// --- Express App Setup ---
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.IDEA_CORS_ORIGIN
      ? process.env.IDEA_CORS_ORIGIN.split(",").map((url) => url.trim())
      : ["http://localhost:5173", "http://localhost:5175"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(
  cors({
    origin: process.env.IDEA_CORS_ORIGIN
      ? process.env.IDEA_CORS_ORIGIN.split(",")
      : ["http://localhost:5173", "http://localhost:5175"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

import authRoutes from "./routes/authRoutes.js";
import likeRoutes from "./routes/likeRoutes.js";
import questionEmbeddingRoutes from "./routes/questionEmbeddingRoutes.js";
import siteConfigRoutes from "./routes/siteConfigRoutes.js";
import themeChatRoutes from "./routes/themeChatRoutes.js";
import themeDigestRoutes from "./routes/themeDigestRoutes.js";
import themeEmbeddingRoutes from "./routes/themeEmbeddingRoutes.js";
import themeGenerateQuestionsRoutes from "./routes/themeGenerateQuestionsRoutes.js";
import themeImportRoutes from "./routes/themeImportRoutes.js";
import themePolicyRoutes from "./routes/themePolicyRoutes.js";
import themeProblemRoutes from "./routes/themeProblemRoutes.js";
import themeQuestionRoutes from "./routes/themeQuestionRoutes.js";
import themeSolutionRoutes from "./routes/themeSolutionRoutes.js";
import topPageRoutes from "./routes/topPageRoutes.js";
import userRoutes from "./routes/userRoutes.js";

// Theme management routes
app.use("/api/themes", themeRoutes);
app.use("/api/auth", authRoutes);

app.use("/api/themes/:themeId/questions", themeQuestionRoutes);
app.use("/api/themes/:themeId/problems", themeProblemRoutes);
app.use("/api/themes/:themeId/solutions", themeSolutionRoutes);
app.use(
  "/api/themes/:themeId/generate-questions",
  themeGenerateQuestionsRoutes
);
app.use("/api/themes/:themeId/policy-drafts", themePolicyRoutes);
app.use("/api/themes/:themeId/digest-drafts", themeDigestRoutes);
app.use("/api/themes/:themeId/import", themeImportRoutes);
app.use("/api/themes/:themeId/chat", themeChatRoutes);
app.use("/api/themes/:themeId", themeEmbeddingRoutes);
app.use("/api/questions/:questionId", questionEmbeddingRoutes);

app.use("/api/site-config", siteConfigRoutes);
app.use("/api/top-page-data", topPageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/likes", likeRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Fallback route for non-API requests
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  const userIdProfileImageRegex = /^\/([0-9a-f-]+)\/profile-image$/;
  const match = req.path.match(userIdProfileImageRegex);

  if (match && req.method === "POST") {
    console.log(
      `Redirecting request from ${req.path} to /api/users${req.path}`
    );
    req.url = `/api/users${req.path}`;
    return next();
  }

  res.status(200).send(`
<html>
  <head>
    <title>Idobata Backend</title>
  </head>
  <body>
    <h1>Idobata Backend Server</h1>
    <p>The backend server is running.</p>
  </body>
</html>
`);
});

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// --- Socket.IO Setup ---
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("subscribe-theme", (themeId) => {
    console.log(`Socket ${socket.id} subscribing to theme: ${themeId}`);
    socket.join(`theme:${themeId}`);
  });

  socket.on("subscribe-thread", (threadId) => {
    console.log(`Socket ${socket.id} subscribing to thread: ${threadId}`);
    socket.join(`thread:${threadId}`);
  });

  socket.on("unsubscribe-theme", (themeId) => {
    console.log(`Socket ${socket.id} unsubscribing from theme: ${themeId}`);
    socket.leave(`theme:${themeId}`);
  });

  socket.on("unsubscribe-thread", (threadId) => {
    console.log(`Socket ${socket.id} unsubscribing from thread: ${threadId}`);
    socket.leave(`thread:${threadId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

export { io };

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
