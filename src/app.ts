import express from 'express';
import seamless from './api/seamless';
import cors from 'cors';
import * as middlewares from './middlewares';
import api from './api';
import telegramAuth from './api/telegram';
import MessageResponse from './interfaces/MessageResponse';
import path from "path";
import { Server } from "socket.io";
// Defer blockchain/game imports to runtime flags to avoid top-level side effects
require('dotenv').config();

const app = express();
// Honor reverse proxy headers for correct protocol/host in OAuth flows
app.set('trust proxy', true);

// app.use(morgan('dev'));
// app.use(helmet());

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ limit: "10mb", extended: true }))

// ----------------- Global CORS + CORP -----------------
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow all origins
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"); // Allowed methods
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); // Allowed headers
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // CORP
  next();
});

// Serve uploads with proper headers

// app.use(
//   "/uploads",
//   express.static(path.join(__dirname, "uploads"), {
//     setHeaders: (res, filePath) => {
//       console.log(filePath)
//       res.setHeader("Access-Control-Allow-Origin", "*"); // CORS
//       res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // CORP
//       res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
//       res.setHeader("Pragma", "no-cache");
//       res.setHeader("Expires", "0");
//     },
//   })
// );


const uploadDir = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDir));

app.get<{}, MessageResponse>('/', (req, res) => {
  res.json({
    message: '🦄🌈✨👋🌎🌍🌏✨🌈🦄',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/v1', api);
app.use('/auth/telegram', telegramAuth);
app.use('/v1/api/seamless', seamless);
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

if (process.env.ENABLE_TRON_WATCHERS === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startObserverTron } = require("./blockchain/tron");
  startObserverTron();
}

// Start deposit monitoring service
if (process.env.ENABLE_DEPOSIT_MONITORING === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { depositMonitoringService } = require("./blockchain/depositListeners");
  depositMonitoringService.start();
  console.log("🚀 Deposit monitoring service started");
}

if (process.env.ENABLE_ETH_WATCHERS === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { watchEth } = require("./blockchain/ether");
  watchEth();
}

if (process.env.ENABLE_SOL_WATCHERS === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { initializeSolana, startWatchSolana } = require("./blockchain/solana");
  try {
    initializeSolana();
    startWatchSolana();
  } catch (error) {
    console.error("Failed to initialize Solana:", error);
  }
}

if (process.env.ENABLE_GAMES === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startGames } = require("./games/games");
  startGames();
}

// Start referral bonus scheduler
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { startReferralBonusScheduler } = require("./utils/referralScheduler");
startReferralBonusScheduler();

export const io = new Server({
  cors: {
    origin: "*",
  },
});

export default app;