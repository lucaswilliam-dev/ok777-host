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
  // Check if required environment variables are set
  if (!OPERATOR_CODE || !SECRET_KEY) {
    console.error(
      "❌ Missing environment variables: OPERATOR_CODE or SECRET_KEY"
    );
    return res.status(500).json({
      error: "Server configuration error",
      message:
        "OPERATOR_CODE and SECRET_KEY must be set in environment variables",
    });
  }

  try {
    const requestTime = Math.floor(Date.now() / 1000);
    const sign = crypto
      .createHash("md5")
      .update(requestTime + SECRET_KEY + "gamelist" + OPERATOR_CODE)
      .digest("hex");

    console.log(
      `📡 Fetching games from ${OPERATOR_URL} for product code: ${req.query.code || 1020}`
    );

    const result = await axios.get(
      `${OPERATOR_URL}/api/operators/provider-games`,
      {
        params: {
          operator_code: OPERATOR_CODE,
          request_time: requestTime,
          sign: sign,
          product_code: Number(req.query.code) || 1020,
        },
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const data = result.data;
    const provider_games = data.provider_games || [];

    if (!provider_games || provider_games.length === 0) {
      console.log(
        "⚠️ No games returned from provider API, trying to return games from database"
      );
      // Fallback: return games from database
      try {
        const dbGames = await getAllGames();
        if (dbGames && dbGames.length > 0) {
          // Transform database games to match provider format
          const transformedGames = dbGames.map((game: any) => ({
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

          return res.json({
            data: {
              provider_games: transformedGames,
            },
            source: "database", // Indicate data came from database
          });
        }
      } catch (dbError) {
        console.error("❌ Database fallback failed:", dbError);
      }

      return res.json({
        data: {
          provider_games: [],
        },
        message: "No games available",
      });
    }

    const gameTypeToCategory: Record<string, number> = {
      LIVE_CASINO: 2,
      SLOT: 3,
      POKER: 4,
      OTHER: 5,
      FISHING: 6,
      SPORT_BOOK: 7,
    };

    const gamesData = provider_games.map((d: any) => {
      return {
        gameCode: d.game_code,
        gameName: d.game_name,
        gameType: d.game_type,
        imageUrl: d.image_url,
        productId: d.product_id,
        productCode: d.product_code,
        supportCurrency: d.support_currency,
        status: d.status,
        allowFreeRound: d.allow_free_round,
        langName: d.lang_name,
        langIcon: d.lang_icon,
        enabled: true,
        category: gameTypeToCategory[d.game_type],
      };
    });

    // Get existing games to avoid duplicates
    const existingGames = await getAllGames();
    const existingGameCodes = new Set(
      existingGames.map((game: any) => game.gameCode)
    );

    // Insert only new games that don't exist in database
    let inserted = 0;
    let skipped = 0;
    for (const g of gamesData) {
      // Skip if game already exists
      if (existingGameCodes.has(g.gameCode)) {
        skipped++;
        continue;
      }

      try {
        await addGame(g);
        inserted++;
      } catch (e) {
        // Handle any other errors
        console.error(`Failed to insert game ${g.gameCode}:`, e);
      }
    }
    console.log(
      `✅ Games inserted: ${inserted}, skipped (already exist): ${skipped}, total: ${gamesData.length}`
    );

    return res.json({ data: result.data });
  } catch (err: any) {
    console.error("❌ Request failed:", err.message);
    console.error("Error details:", {
      code: err.code,
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
    });

    // Try to return games from database as fallback
    try {
      console.log("🔄 Attempting to return games from database as fallback...");
      const dbGames = await getAllGames();
      if (dbGames && dbGames.length > 0) {
        // Transform database games to match provider format
        const transformedGames = dbGames.map((game: any) => ({
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

        console.log(
          `✅ Returning ${transformedGames.length} games from database`
        );
        return res.json({
          data: {
            provider_games: transformedGames,
          },
          source: "database",
          warning: "Provider API unavailable, showing cached games",
        });
      }
    } catch (dbError) {
      console.error("❌ Database fallback also failed:", dbError);
    }

    // Determine error message based on error type
    let errorMessage = "Failed to fetch provider games";
    if (err.code === "ECONNRESET") {
      errorMessage =
        "Connection to provider API was reset. Please check your network connection and try again.";
    } else if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
      errorMessage =
        "Request to provider API timed out. The service may be temporarily unavailable.";
    } else if (err.code === "ENOTFOUND") {
      errorMessage =
        "Could not resolve provider API hostname. Please check your network connection.";
    } else if (err.response?.data?.message) {
      errorMessage = err.response.data.message;
    } else if (err.message) {
      errorMessage = err.message;
    }

    return res.status(err.response?.status || 500).json({
      error: errorMessage,
      message: errorMessage,
      code: err.code || "UNKNOWN_ERROR",
    });
  }
});

router.post("/launch-game", isAuthenticated, async (req, res) => {
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

    // Get operator password from environment or use default (MD5 of "123456")
    // Note: This should be configured per user in production
    const operatorPassword =
      process.env.OPERATOR_USER_PASSWORD ||
      "$2b$10$aY7/JBI.F0cZ1kov3DuGyueK/dYCV6D/HCBOHh.Ixj5SUN0LGDuDq";

    const payload = {
      operator_code: OPERATOR_CODE,
      member_account: user.id.toString(),
      password: operatorPassword,
      nickname: user.name || user.email || `user_${user.id}`,
      currency: currency.toUpperCase(), // Use provided currency, default to IDR
      game_code: game_code,
      product_code: Number(product_code),
      game_type: game_type,
      language_code: Number(language_code),
      ip: clientIp,
      platform: "WEB",
      sign: generateLaunchGameSign(OPERATOR_CODE, request_time, SECRET_KEY),
      request_time: request_time,
      operator_lobby_url: operator_lobby,
    };

    console.log("payload========>", payload);
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
      return res.status(err.response.status || 500).json({
        success: false,
        message: err.response.data.message || "Failed to launch game",
        code: err.response.status || 500,
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
      .update(requestTime + SECRET_KEY + "gamelist" + OPERATOR_CODE)
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
