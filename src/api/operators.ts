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
    if (!OPERATOR_CODE || !SECRET_KEY) {
      console.error(
        "Missing required environment variables: OPERATOR_CODE or SECRET_KEY"
      );
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
        code: 500,
      });
    }

    const id = req["token"].id;
    const role = req["token"].role;

    const {
      product_code,
      game_type,
      currency = "IDR", // Default to IDR if not provided
      game_code,
      language_code = 0,
    } = req.body || {};

    // Store for error handling
    gameCode = game_code;
    productCode = Number(product_code);

    // Input validation
    if (!product_code) {
      return res.status(400).json({
        success: false,
        message: "product_code parameter required",
        code: 400,
      });
    }
    if (!game_type) {
      return res.status(400).json({
        success: false,
        message: "game_type parameter required",
        code: 400,
      });
    }
    if (!game_code) {
      return res.status(400).json({
        success: false,
        message: "game_code parameter required",
        code: 400,
      });
    }

    // Validate product_code is a number
    if (isNaN(Number(product_code))) {
      return res.status(400).json({
        success: false,
        message: "product_code must be a valid number",
        code: 400,
      });
    }

    // Validate language_code is a number
    if (isNaN(Number(language_code))) {
      return res.status(400).json({
        success: false,
        message: "language_code must be a valid number",
        code: 400,
      });
    }

    // Validate game_code format
    if (typeof game_code !== "string" && typeof game_code !== "number") {
      return res.status(400).json({
        success: false,
        message: "game_code must be a string or number",
        code: 400,
      });
    }

    // Verify game exists in provider's game list BEFORE launching
    try {
      console.log(
        `🔍 Verifying game code "${game_code}" exists for product ${product_code}...`
      );

      // Fetch games from provider API to verify game exists
      const requestTime = Math.floor(Date.now() / 1000);
      const verifySign = crypto
        .createHash("md5")
        .update(requestTime + SECRET_KEY + "gamelist" + OPERATOR_CODE)
        .digest("hex");

      const verifyResponse = await axios.get(
        `${OPERATOR_URL}/api/operators/provider-games`,
        {
          params: {
            operator_code: OPERATOR_CODE,
            request_time: requestTime,
            sign: verifySign,
            product_code: Number(product_code),
          },
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 10000, // 10 second timeout for verification
        }
      );

      const providerGames = verifyResponse.data?.provider_games || [];
      const gameExists = providerGames.some(
        (g: any) => g.game_code === game_code.toString()
      );

      if (!gameExists) {
        console.error(
          `❌ Game code "${game_code}" NOT FOUND in provider's game list for product ${product_code}`
        );
        console.error(
          `Available games for product ${product_code}:`,
          providerGames.map((g: any) => g.game_code).slice(0, 10)
        );

        return res.status(400).json({
          success: false,
          message: `Game code "${game_code}" does not exist or is not available for product ${product_code}`,
          code: 400,
          debug: {
            requested_game_code: game_code,
            requested_product_code: product_code,
            available_game_codes: providerGames
              .map((g: any) => ({
                game_code: g.game_code,
                game_name: g.game_name,
                game_type: g.game_type,
              }))
              .slice(0, 20), // Show first 20 games
            total_games_available: providerGames.length,
          },
        });
      }

      console.log(
        `✅ Game code "${game_code}" verified - exists in provider's game list`
      );
    } catch (verifyError: any) {
      console.warn(
        "⚠️ Could not verify game with provider API:",
        verifyError.message
      );
      console.warn("Continuing with launch request anyway...");
      // Continue anyway - verification is helpful but not required
    }

    // Get user profile based on role
    let user;
    if (role === "user") {
      try {
        user = await getProfile(id);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
            code: 404,
          });
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch user profile",
          code: 500,
        });
      }
    } else if (role === "admin") {
      // Fetch admin user from database
      try {
        const admin = await prisma.admin.findUnique({ where: { id } });
        if (!admin) {
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
      } catch (error) {
        console.error("Error fetching admin profile:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch admin profile",
          code: 500,
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
        code: 403,
      });
    }

    // Get client IP address (handle proxy headers)
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "127.0.0.1";

    const request_time = Math.floor(Date.now() / 1000);

    // Get operator password from environment or use default
    // Note: This should be configured per user in production
    const operatorPasswordPlain =
      process.env.OPERATOR_USER_PASSWORD || "pjg2006131!@#";

    // Game provider expects MD5 hash of password (not bcrypt or plain text)
    // Example: "e10adc3949ba59abbe56e057f20f883e" is MD5 of "123456"
    const operatorPassword = crypto
      .createHash("md5")
      .update(operatorPasswordPlain)
      .digest("hex");

    // Format member_account - ensure it's a string
    // Some providers may require specific format (e.g., prefix + ID)
    memberAccount = user.id.toString();

    // Attempt to register member with provider if not already registered
    // Some providers require member registration before launching games
    try {
      console.log(
        `📝 Attempting to register/verify member account "${memberAccount}" with provider...`
      );

      const registerRequestTime = Math.floor(Date.now() / 1000);
      const registerSign = crypto
        .createHash("md5")
        .update(
          registerRequestTime + SECRET_KEY + "createmember" + OPERATOR_CODE
        )
        .digest("hex");

      // Try common member registration endpoints
      const registerEndpoints = [
        `${OPERATOR_URL}/api/operators/create-member`,
        `${OPERATOR_URL}/api/operators/register-member`,
        `${OPERATOR_URL}/api/operators/member-register`,
      ];

      let memberRegistered = false;
      for (const endpoint of registerEndpoints) {
        try {
          const registerPayload = {
            operator_code: OPERATOR_CODE,
            member_account: memberAccount,
            nickname: user.name || user.email || `user_${user.id}`,
            currency: currency.toUpperCase(),
            password: operatorPassword,
            sign: registerSign,
            request_time: registerRequestTime,
          };

          await axios.post(endpoint, registerPayload, {
            headers: { "Content-Type": "application/json" },
            timeout: 5000,
          });

          console.log(
            `✅ Member account "${memberAccount}" registered successfully`
          );
          memberRegistered = true;
          break;
        } catch (regError: any) {
          // If endpoint doesn't exist or member already exists, continue
          if (regError.response?.status === 404) {
            continue; // Try next endpoint
          }
          if (
            regError.response?.data?.message?.includes("already exists") ||
            regError.response?.data?.code === 1001
          ) {
            console.log(
              `ℹ️ Member account "${memberAccount}" already exists in provider system`
            );
            memberRegistered = true;
            break;
          }
        }
      }

      if (!memberRegistered) {
        console.warn(
          `⚠️ Could not register member via API - member may need manual registration or first deposit`
        );
        console.warn(
          `⚠️ Continuing with launch attempt - provider may auto-register on first use`
        );
      }
    } catch (regError: any) {
      console.warn("⚠️ Member registration attempt failed:", regError.message);
      console.warn(
        "⚠️ Continuing with launch - member may be auto-registered or already exists"
      );
      // Continue anyway - some providers auto-register on first launch or deposit
    }

    const payload = {
      operator_code: OPERATOR_CODE,
      member_account: memberAccount,
      password: operatorPassword,
      nickname: user.name || user.email || `user_${user.id}`,
      currency: currency.toUpperCase(), // Use provided currency, default to IDR
      game_code: game_code.toString(), // Ensure game_code is string
      product_code: Number(product_code),
      game_type: game_type,
      language_code: Number(language_code),
      ip: clientIp,
      platform: "WEB",
      sign: generateLaunchGameSign(OPERATOR_CODE, request_time, SECRET_KEY),
      request_time: request_time,
      operator_lobby_url: operator_lobby,
    };

    // Make request to operator API with timeout
    const response = await axios.post(
      `${OPERATOR_URL}/api/operators/launch-game`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000, // 30 second timeout
      }
    );

    if (response.data.code === 200) {
      return res.json({
        success: true,
        url: response.data.url,
        message: response.data.message,
        code: 200,
      });
    } else {
      console.log("response==========>", response.data);
      console.error("Launch game error:", response.data);
      return res.status(400).json({
        success: false,
        message: response.data.message || "Failed to launch game",
        code: response.data.code || 400,
      });
    }
  } catch (err: any) {
    // Improved error handling
    console.error("Launch game error:", {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      code: err.code,
    });

    // Handle specific error types
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return res.status(504).json({
        success: false,
        message: "Request to game provider timed out. Please try again.",
        code: 504,
      });
    }

    if (err.response?.data) {
      const errorData = err.response.data;
      const errorCode = errorData.code || err.response.status || 500;
      const errorMessage = errorData.message || "Failed to launch game";

      // Enhanced error messages for common issues
      let userFriendlyMessage = errorMessage;

      if (errorCode === 999) {
        if (
          errorMessage.includes("record not found") ||
          errorMessage.includes("agent not found")
        ) {
          // Since we verified the game exists, this is most likely a member registration issue
          userFriendlyMessage = `❌ Record not found (Code 999)

🔍 Diagnosis:
Since the game code was verified successfully, the issue is most likely:
**Member account "${memberAccount || "N/A"}" is NOT registered with the game provider.**

📋 Solutions:
1. **Contact your provider** to register member account "${memberAccount}"
2. **Make a first deposit** - some providers auto-register members on first deposit
3. **Check provider documentation** for member registration endpoint
4. **Verify operator account** is fully configured and active

💡 Note: The game code and product code are valid. This is a member registration issue.`;
        }
      }

      console.error("❌ Provider API Error Response:");
      console.error("Code:", errorCode);
      console.error("Message:", errorMessage);
      console.error("Details:", errorData.details || "No additional details");
      console.error("Full Response:", JSON.stringify(errorData, null, 2));

      return res
        .status(errorCode >= 400 && errorCode < 600 ? errorCode : 500)
        .json({
          success: false,
          message: userFriendlyMessage,
          code: errorCode,
          details: errorData.details || null,
          debug: {
            operator_code: OPERATOR_CODE,
            member_account: memberAccount || "N/A",
            game_code: gameCode || "N/A",
            product_code: productCode || "N/A",
          },
        });
    }

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
