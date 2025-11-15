import express from "express";
import { listWagers, getWager, saveProductsBulk } from "../db/operators";
import { verifyRequest, generateLaunchGameSign } from "../utils/gsc";
import isAuthenticated, { isAdmin } from "../utils/jwt";
import { getProfile } from "../db/users";
import prisma from "../db/prisma";
import { getAllProducts } from "../db/games";
import {
  getAllGames,
  getTempGames,
  savedGamesBulk,
  addGame,
  getGames,
} from "../db/admin";

const axios = require("axios");
const crypto = require("crypto");

const OPERATOR_CODE = process.env.OPERATOR_CODE;
const SECRET_KEY = process.env.SECRET_KEY;
const OPERATOR_URL = "https://staging.gsimw.com";
const operator_lobby = "https://ok-777-admin-1.vercel.app";

// const prisma = new PrismaClient();

const router = express.Router();

// Ensure JSON bodies are parsed when this router is mounted independently
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get("/available-products", async (req, res) => {
  try {
    const requestTime = Math.floor(Date.now() / 1000);
    const sign = crypto
      .createHash("md5")
      .update(requestTime + SECRET_KEY + "productlist" + OPERATOR_CODE)
      .digest("hex");

    const result = await axios.get(
      `${OPERATOR_URL}/api/operators/available-products`,
      {
        params: {
          operator_code: OPERATOR_CODE,
          request_time: requestTime,
          sign: sign,
          product_code: 1020,
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    await saveProductsBulk(result.data);

    return res.json({ data: result.data });
  } catch (err) {
    console.error("❌ Request failed:", err.response?.data || err.message);
  }
});

router.get("/provider-games", async (req, res) => {
  // Get pagination parameters
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 21;
  const productCode = req.query.code ? Number(req.query.code) : undefined;

  try {
    // Fetch games directly from database with pagination
    const result = await getGames({
      page: page,
      limit: limit,
      providerId: productCode ? productCode.toString() : undefined,
      enabled: true, // Only fetch enabled games
    });

    // Transform database games to match provider format
    const transformedGames = result.data.map((game: any) => ({
      game_code: game.gameCode,
      game_name: game.gameName,
      game_type: game.gameType,
      image_url: game.imageUrl,
      product_id: game.productId,
      product_code: game.productCode,
      support_currency: game.supportCurrency,
      status: game.status,
      allow_free_round: game.allowFreeRound,
      lang_name: game.langName,
      lang_icon: game.langIcon,
    }));

    // Additional deduplication safety layer - remove any duplicates by game_code
    const uniqueGamesMap = new Map();
    for (const game of transformedGames) {
      if (!uniqueGamesMap.has(game.game_code)) {
        uniqueGamesMap.set(game.game_code, game);
      }
    }
    const uniqueGames = Array.from(uniqueGamesMap.values());

    return res.json({
      data: {
        provider_games: uniqueGames,
      },
      pagination: {
        total: result.meta.total,
        page: result.meta.page,
        limit: limit,
        totalPages: result.meta.totalPages,
      },
      source: "database",
    });
  } catch (err: any) {
    console.error("❌ Database query failed:", err.message);
    console.error("Error details:", {
      code: err.code,
      message: err.message,
    });

    return res.status(500).json({
      error: "Failed to fetch games from database",
      message: err.message || "Internal server error",
      code: err.code || "DATABASE_ERROR",
    });
  }
});

router.post("/launch-game", isAuthenticated, async (req, res) => {
  // Declare variables outside try block for error handling
  let memberAccount: string = "";
  let gameCode: string | number = "";
  let productCode: number = 0;
  
  try {
    // Validate environment variables
    console.log("📋 [STEP 1] Validating environment variables...");
    if (!OPERATOR_CODE || !SECRET_KEY) {
      console.error(
        "❌ [STEP 1] FAILED: Missing required environment variables"
      );
      console.error(
        "   - OPERATOR_CODE:",
        OPERATOR_CODE ? "✓ Set" : "✗ Missing"
      );
      console.error("   - SECRET_KEY:", SECRET_KEY ? "✓ Set" : "✗ Missing");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
        code: 500,
      });
    }
    console.log("✅ [STEP 1] Environment variables validated");
    console.log("   - OPERATOR_CODE:", OPERATOR_CODE);
    console.log(
      "   - SECRET_KEY:",
      SECRET_KEY ? "***" + SECRET_KEY.slice(-4) : "Missing"
    );

    const id = req["token"].id;
    const role = req["token"].role;
    console.log("👤 [AUTH] User authenticated");
    console.log("   - User ID:", id);
    console.log("   - Role:", role);

    console.log("📥 [STEP 2] Extracting request body...");
    const {
      product_code,
      game_type,
      currency = "IDR", // Default to IDR if not provided
      game_code,
      language_code = 0,
    } = req.body || {};

    console.log("   - product_code:", product_code);
    console.log("   - game_type:", game_type);
    console.log("   - currency:", currency);
    console.log("   - game_code:", game_code);
    console.log("   - language_code:", language_code);

    // Input validation
    console.log("🔍 [STEP 3] Validating input parameters...");

    if (!product_code) {
      console.error("❌ [STEP 3] VALIDATION FAILED: product_code is required");
      return res.status(400).json({
        success: false,
        message: "product_code parameter required",
        code: 400,
      });
    }
    console.log("   ✓ product_code provided:", product_code);

    if (!game_type) {
      console.error("❌ [STEP 3] VALIDATION FAILED: game_type is required");
      return res.status(400).json({
        success: false,
        message: "game_type parameter required",
        code: 400,
      });
    }
    console.log("   ✓ game_type provided:", game_type);

    // game_code is optional - can be null for some game types (e.g., lobby)
    // Only validate format if provided
    if (game_code !== null && game_code !== undefined) {
      if (typeof game_code !== "string" && typeof game_code !== "number") {
        console.error("❌ [STEP 3] VALIDATION FAILED: Invalid game_code type");
        console.error("   - Expected: string, number, or null");
        console.error("   - Received:", typeof game_code, game_code);
        return res.status(400).json({
          success: false,
          message: "game_code must be a string, number, or null",
          code: 400,
        });
      }
      console.log(
        "   ✓ game_code validated:",
        game_code,
        `(type: ${typeof game_code})`
      );
    } else {
      console.log(
        "   ℹ️ game_code is null/undefined (optional for lobby launches)"
      );
    }

    // Validate product_code is a number
    if (isNaN(Number(product_code))) {
      console.error(
        "❌ [STEP 3] VALIDATION FAILED: product_code must be a number"
      );
      console.error(
        "   - Received:",
        product_code,
        `(type: ${typeof product_code})`
      );
      return res.status(400).json({
        success: false,
        message: "product_code must be a valid number",
        code: 400,
      });
    }
    console.log("   ✓ product_code is valid number:", Number(product_code));

    // Validate language_code is a number
    if (isNaN(Number(language_code))) {
      console.error(
        "❌ [STEP 3] VALIDATION FAILED: language_code must be a number"
      );
      console.error(
        "   - Received:",
        language_code,
        `(type: ${typeof language_code})`
      );
      return res.status(400).json({
        success: false,
        message: "language_code must be a valid number",
        code: 400,
      });
    }
    console.log("   ✓ language_code is valid number:", Number(language_code));
    console.log("✅ [STEP 3] All input parameters validated successfully");

    // Get user profile based on role
    console.log("👤 [STEP 4] Fetching user profile...");
    console.log("   - Role:", role);
    console.log("   - User ID:", id);

    let user;
    if (role === "user") {
      try {
        console.log("   → Fetching user profile from database...");
        user = await getProfile(id);
        if (!user) {
          console.error("❌ [STEP 4] User not found in database");
          return res.status(404).json({
            success: false,
            message: "User not found",
            code: 404,
          });
        }
        console.log("✅ [STEP 4] User profile fetched successfully");
        console.log("   - User ID:", user.id);
        console.log("   - Name:", user.name || "N/A");
        console.log("   - Email:", user.email || "N/A");
      } catch (error) {
        console.error("❌ [STEP 4] Error fetching user profile:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch user profile",
          code: 500,
        });
      }
    } else if (role === "admin") {
      // Fetch admin user from database
      try {
        console.log("   → Fetching admin profile from database...");
        const admin = await prisma.admin.findUnique({ where: { id } });
        if (!admin) {
          console.error("❌ [STEP 4] Admin not found in database");
          return res.status(404).json({
            success: false,
            message: "Admin not found",
            code: 404,
          });
        }
        user = {
          id: admin.id,
          name: admin.email, // Admin uses email as name
          email: admin.email,
        };
        console.log("✅ [STEP 4] Admin profile fetched successfully");
        console.log("   - Admin ID:", user.id);
        console.log("   - Email:", user.email);
      } catch (error) {
        console.error("❌ [STEP 4] Error fetching admin profile:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch admin profile",
          code: 500,
        });
      }
    } else {
      console.error("❌ [STEP 4] Invalid user role:", role);
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
        code: 403,
      });
    }

    // Get client IP address (handle proxy headers)
    console.log("🌐 [STEP 5] Extracting client IP address...");
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "127.0.0.1";
    console.log("   - Client IP:", clientIp);
    console.log(
      "   - x-forwarded-for:",
      req.headers["x-forwarded-for"] || "N/A"
    );
    console.log("   - x-real-ip:", req.headers["x-real-ip"] || "N/A");
    console.log(
      "   - socket.remoteAddress:",
      req.socket.remoteAddress || "N/A"
    );

    console.log("⏰ [STEP 6] Generating request timestamp...");
    const request_time = Math.floor(Date.now() / 1000);
    console.log("   - Request time (Unix timestamp):", request_time);
    console.log(
      "   - Request time (ISO):",
      new Date(request_time * 1000).toISOString()
    );

    // Get operator password from environment
    // Provider expects MD5 hash of password (not bcrypt or plain text)
    // Example: "e10adc3949ba59abbe56e057f20f883e" is MD5 of "123456"
    console.log("🔐 [STEP 7] Processing operator password...");
    const operatorPasswordPlain = process.env.OPERATOR_USER_PASSWORD;

    if (!operatorPasswordPlain) {
      console.error(
        "❌ [STEP 7] Missing required environment variable: OPERATOR_USER_PASSWORD"
      );
      return res.status(500).json({
        success: false,
        message: "Server configuration error: OPERATOR_USER_PASSWORD not set",
        code: 500,
      });
    }
    console.log(
      "   - Password from env:",
      operatorPasswordPlain.length > 0
        ? "***" + operatorPasswordPlain.slice(-4)
        : "Empty"
    );

    // If password is already an MD5 hash (32 hex characters), use it directly
    // Otherwise, hash it with MD5
    const isMD5Hash = /^[a-f0-9]{32}$/i.test(operatorPasswordPlain);
    console.log("   - Is MD5 hash?", isMD5Hash);

    const operatorPassword = isMD5Hash
      ? operatorPasswordPlain
      : crypto.createHash("md5").update(operatorPasswordPlain).digest("hex");

    if (!isMD5Hash) {
      console.log("   → Password was plain text, hashed to MD5");
    }
    console.log("   - Final password (MD5):", operatorPassword);
    console.log("✅ [STEP 7] Password processed successfully");

    console.log("📦 [STEP 8] Constructing payload...");
    memberAccount = user.id.toString();
    const finalGameCode =
      game_code !== null && game_code !== undefined
        ? game_code.toString()
        : null;
    const sign = generateLaunchGameSign(
      OPERATOR_CODE,
      request_time,
      SECRET_KEY
    );

    const payload = {
      operator_code: OPERATOR_CODE,
      member_account: memberAccount,
      password: operatorPassword,
      nickname: user.name || user.email || `user_${user.id}`,
      currency: currency.toUpperCase(), // Use provided currency, default to IDR
      game_code: finalGameCode,
      product_code: Number(product_code),
      game_type: game_type,
      language_code: Number(language_code),
      ip: clientIp,
      platform: "WEB",
      sign: sign,
      request_time: request_time,
      operator_lobby_url: operator_lobby,
    };

    console.log("   - Payload constructed:");
    console.log("     • operator_code:", payload.operator_code);
    console.log("     • member_account:", payload.member_account);
    console.log("     • password:", payload.password);
    console.log("     • nickname:", payload.nickname);
    console.log("     • currency:", payload.currency);
    console.log("     • game_code:", payload.game_code);
    console.log("     • product_code:", payload.product_code);
    console.log("     • game_type:", payload.game_type);
    console.log("     • language_code:", payload.language_code);
    console.log("     • ip:", payload.ip);
    console.log("     • platform:", payload.platform);
    console.log("     • sign:", payload.sign);
    console.log("     • request_time:", payload.request_time);
    console.log("     • operator_lobby_url:", payload.operator_lobby_url);
    console.log("✅ [STEP 8] Payload ready");

    // Make request to operator API with timeout
    console.log("🚀 [STEP 9] Sending request to operator API...");
    console.log("   - URL:", `${OPERATOR_URL}/api/operators/launch-game`);
    console.log("   - Method: POST");
    console.log("   - Timeout: 30000ms (30 seconds)");
    console.log("   - Headers: Content-Type: application/json");

    const requestStartTime = Date.now();
    const response = await axios.post(
      `${OPERATOR_URL}/api/operators/launch-game`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000, // 30 second timeout
      }
    );
    const requestDuration = Date.now() - requestStartTime;

    console.log("✅ [STEP 9] Response received from operator API");
    console.log("   - Response time:", requestDuration + "ms");
    console.log("   - Status:", response.status);
    console.log("   - Response data:", JSON.stringify(response.data, null, 2));

    console.log("📊 [STEP 10] Processing response...");
    if (response.data.code === 200) {
      console.log("✅ [STEP 10] SUCCESS: Game launch successful");
      console.log("   - Response code:", response.data.code);
      console.log("   - Game URL:", response.data.url);
      console.log("   - Message:", response.data.message);
      console.log(
        "═══════════════════════════════════════════════════════════"
      );
      console.log("🎉 [LAUNCH-GAME] Request completed successfully");
      console.log(
        "═══════════════════════════════════════════════════════════"
      );

      return res.json({
        success: true,
        url: response.data.url,
        message: response.data.message,
        code: 200,
      });
    } else {
      console.error("❌ [STEP 10] FAILED: Game launch unsuccessful");
      console.error("   - Response code:", response.data.code);
      console.error("   - Message:", response.data.message);
      console.error(
        "   - Full response:",
        JSON.stringify(response.data, null, 2)
      );
      console.log(
        "═══════════════════════════════════════════════════════════"
      );
      console.log("❌ [LAUNCH-GAME] Request failed");
      console.log(
        "═══════════════════════════════════════════════════════════"
      );

      return res.status(400).json({
        success: false,
        message: response.data.message || "Failed to launch game",
        code: response.data.code || 400,
      });
    }
  } catch (err: any) {
    // Improved error handling
    console.error(
      "═══════════════════════════════════════════════════════════"
    );
    console.error("💥 [LAUNCH-GAME] EXCEPTION CAUGHT");
    console.error(
      "═══════════════════════════════════════════════════════════"
    );
    console.error("❌ Error Type:", err.name || "Unknown");
    console.error("❌ Error Message:", err.message);
    console.error("❌ Error Code:", err.code || "N/A");
    console.error("❌ Error Stack:", err.stack || "N/A");

    if (err.response) {
      console.error("📡 HTTP Response Details:");
      console.error("   - Status:", err.response.status);
      console.error("   - Status Text:", err.response.statusText);
      console.error(
        "   - Response Data:",
        JSON.stringify(err.response.data, null, 2)
      );
      console.error(
        "   - Response Headers:",
        JSON.stringify(err.response.headers, null, 2)
      );
    } else if (err.request) {
      console.error("📡 No HTTP response received (network/connection error)");
      console.error("📤 Request Details:");
      console.error(
        "   - Request config:",
        JSON.stringify(
          {
            url: err.config?.url,
            method: err.config?.method,
            timeout: err.config?.timeout,
          },
          null,
          2
        )
      );
    } else {
      console.error("📡 No request/response details available");
    }

    // Handle specific error types
    console.error("🔧 [ERROR HANDLING] Processing error...");

    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      console.error("⏱️ [ERROR] Request timeout detected");
      console.error("   - Error code:", err.code);
      console.error("   - Timeout after:", err.config?.timeout || "N/A", "ms");
      console.log(
        "═══════════════════════════════════════════════════════════"
      );

      return res.status(504).json({
        success: false,
        message: "Request to game provider timed out. Please try again.",
        code: 504,
      });
    }

    if (err.code === "ECONNREFUSED") {
      console.error("🔌 [ERROR] Connection refused");
      console.error("   - The operator API server may be down or unreachable");
      console.log(
        "═══════════════════════════════════════════════════════════"
      );
    }

    if (err.code === "ENOTFOUND") {
      console.error("🌐 [ERROR] DNS resolution failed");
      console.error("   - Hostname not found:", err.hostname || "N/A");
      console.log(
        "═══════════════════════════════════════════════════════════"
      );
    }

    if (err.response?.data) {
      console.error("📥 [ERROR] HTTP error response received");
      console.error("   - Status code:", err.response.status);
      console.error("   - Error message:", err.response.data.message || "N/A");
      console.error("   - Error code:", err.response.data.code || "N/A");
      
      const errorData = err.response.data;
      const errorCode = errorData.code || err.response.status || 500;
      const errorMessage = errorData.message || "Failed to launch game";
      
      // Enhanced error messages for common issues
      let userFriendlyMessage = errorMessage;
      
      if (errorCode === 999) {
        console.error("🔍 [ERROR CODE 999] Analyzing error...");
        console.error("   - Error code 999 can indicate:");
        console.error("     1. Invalid game/product combination");
        console.error("     2. Game not available for this product");
        console.error("     3. Provider internal error");
        console.error("     4. Operator configuration issue");
        console.error("     5. Game provider service unavailable");
        
        // Check error message for specific clues
        const lowerMessage = errorMessage.toLowerCase();
        
        if (
          lowerMessage.includes("record not found") ||
          lowerMessage.includes("not found") ||
          lowerMessage.includes("does not exist")
        ) {
          userFriendlyMessage = `❌ Game/Product Not Found (Code 999)

🔍 Diagnosis:
The game provider returned error code 999 with message: "${errorMessage}"

📋 Possible Causes:
1. **Game code "${gameCode || "N/A"}" not available for product ${productCode || "N/A"}**
2. **Product code ${productCode || "N/A"} is invalid or not configured**
3. **Game provider database issue**
4. **Game temporarily unavailable**

💡 Recommendations:
1. Verify game code "${gameCode || "N/A"}" exists for product ${productCode || "N/A"}
2. Check if the game is enabled in provider system
3. Try a different game code
4. Contact provider support with:
   - Operator Code: ${OPERATOR_CODE}
   - Member Account: ${memberAccount || "N/A"}
   - Product Code: ${productCode || "N/A"}
   - Game Code: ${gameCode || "N/A"}`;
        } else if (
          lowerMessage.includes("member") ||
          lowerMessage.includes("account") ||
          lowerMessage.includes("user")
        ) {
          userFriendlyMessage = `❌ Member Account Issue (Code 999)

🔍 Diagnosis:
The game provider returned error code 999 related to member account.

📋 Possible Causes:
1. Member account configuration issue
2. Account status problem
3. Account permissions issue

💡 Recommendations:
1. Verify member account "${memberAccount || "N/A"}" is active
2. Check account permissions with provider
3. Contact provider support with:
   - Operator Code: ${OPERATOR_CODE}
   - Member Account: ${memberAccount || "N/A"}
   - Product Code: ${productCode || "N/A"}
   - Game Code: ${gameCode || "N/A"}`;
        } else {
          userFriendlyMessage = `❌ Provider Error (Code 999)

🔍 Diagnosis:
The game provider returned error code 999: "${errorMessage}"

📋 Possible Causes:
1. Invalid game/product combination
2. Game not available for this product
3. Provider internal error
4. Operator configuration issue
5. Service temporarily unavailable

💡 Recommendations:
1. Verify game code "${gameCode || "N/A"}" is valid for product ${productCode || "N/A"}
2. Check provider status/availability
3. Try again in a few moments
4. Contact provider support with:
   - Operator Code: ${OPERATOR_CODE}
   - Member Account: ${memberAccount || "N/A"}
   - Product Code: ${productCode || "N/A"}
   - Game Code: ${gameCode || "N/A"}
   - Error Message: "${errorMessage}"`;
        }
      }
      
      console.error("   - User-friendly message prepared");
      console.log(
        "═══════════════════════════════════════════════════════════"
      );

      return res.status(err.response.status || 500).json({
        success: false,
        message: userFriendlyMessage,
        code: errorCode,
        details: errorData.details || null,
        debug: {
          operator_code: OPERATOR_CODE,
          member_account: memberAccount || "N/A",
          game_code: gameCode || "N/A",
          product_code: productCode || "N/A",
          provider_error_code: errorCode,
          provider_error_message: errorMessage,
        },
      });
    }

    console.error("⚠️ [ERROR] Unhandled error type");
    console.error("   - Returning generic error response");
    console.log("═══════════════════════════════════════════════════════════");
    console.error("❌ [LAUNCH-GAME] Request failed with unhandled error");
    console.log("═══════════════════════════════════════════════════════════");

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
      code: 500,
    });
  }
});

router.get("/wagers", async (req, res) => {
  const { operator_code, sign, request_time, page, size, start, end } =
    req.query;

  try {
    if (
      !verifyRequest(
        operator_code as string,
        Number(request_time),
        "wagers",
        process.env.SECRET_KEY!,
        sign as string
      )
    ) {
      return res.status(400).json({ code: -1, message: "Invalid signature" });
    }

    const result = await listWagers(
      Number(page) || 1,
      Number(size) || 1000,
      start ? Number(start) : undefined,
      end ? Number(end) : undefined
    );
    res.json(result);
  } catch (err) {
    console.error("Error fetching wagers:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/wagers/:key", async (req, res) => {
  const { operator_code, sign, request_time } = req.query;
  const { key } = req.params;

  if (
    !verifyRequest(
      operator_code as string,
      Number(request_time),
      "wager",
      process.env.SECRET_KEY!,
      sign as string
    )
  ) {
    return res.status(400).json({ code: -1, message: "Invalid signature" });
  }

  try {
    const wager = await getWager(key);
    if (!wager) {
      return res.status(404).json({ code: -1, message: "Wager not found" });
    }
    res.json(wager);
  } catch (err: any) {
    console.error("Error fetching wager:", err);
    res.status(500).json({ code: -1, message: "Internal server error" });
  }
});

const getProdGames = async (code: number) => {
  try {
    const requestTime = Math.floor(Date.now() / 1000);
    const sign = crypto
      .createHash("md5")
      .update(requestTime + SECRET_KEY + "launchgame" + OPERATOR_CODE)
      .digest("hex");

    const result = await axios.get(
      `${OPERATOR_URL}/api/operators/provider-games`,
      {
        params: {
          operator_code: OPERATOR_CODE,
          request_time: requestTime,
          sign: sign,
          product_code: Number(code),
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return result.data;
  } catch (err) {
    console.error("❌ Request failed:", err.response?.data || err.message);
  }
};

router.post("/check-games", isAdmin, async (req, res) => {
  try {
    const savedGames = await getAllGames();
    const savedGamesCodes = new Set();

    savedGames.forEach((game) => {
      savedGamesCodes.add(game.gameCode);
    });

    const savedTempGames = await getTempGames();

    savedTempGames.forEach((game) => {
      savedGamesCodes.add(game.gameCode);
    });

    const products = await getAllProducts();
    let allProdGames: Array<any> = [];
    let i = 0;

    while (i < products.length) {
      try {
        const prodGames = await getProdGames(products[i].code);
        prodGames.provider_games.forEach((prodGame: any) => {
          if (!savedGamesCodes.has(prodGame.game_code)) {
            allProdGames.push(prodGame);
          }
        });
      } catch (err) {
        console.error(err.response?.data || err.message);
      }
      i++;
    }

    await savedGamesBulk(allProdGames);

    res.json({ status: 200 });
  } catch (err) {
    console.error("❌ Request failed:", err.response?.data || err.message);
  }
});

router.get("/temp-games", isAdmin, async (req, res) => {
  try {
    const tempGames = await getTempGames();

    res.json(tempGames);
  } catch (err) {
    console.error("❌ Request failed:", err.response?.data || err.message);
  }
});

export default router;
