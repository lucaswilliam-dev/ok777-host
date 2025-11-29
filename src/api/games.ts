import express from 'express';
import isAuthenticated from '../utils/jwt';
import { BetBigSmall } from '../games/bigSmall';
import { BetLucky } from '../games/lucky';
import { BetNuiNui } from '../games/niuniu';
import { BetBankerPlayer } from "../games/bankerPlayer";
import { BetOddEven } from '../games/oddEven';
import { readAllConfigs } from '../db/admin';
import { getGamesByCategory, getAllCategories, getAllProducts, getGamesByExtraGameType } from '../db/games';

const router = express.Router();

router.get('/products', async (req, res) => {
    try {
        const products = await getAllProducts();
        res.json({
            code: 200,
            message: 'All products fetched successfully',
            data: products,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ code: 500, message: 'Internal server error' });
    }
});

router.get("/list", async (req, res) => {
    try {
        const category = req.query.category ? Number(req.query.category) : undefined;
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 10;

        const result = await getGamesByCategory({ category, page, limit });

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get("/games-categories", async (req, res) => {
    try {
        const categories = await getAllCategories();
        res.json({ data: categories });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});


router.post<{}, {}>('/bet', isAuthenticated, async (req, res) => {

    const body = req.body;

    const id = req['token'].id;

    if (!body.game) {
        res.status(400).send({
            message: 'game parametr required',
            code: 400
        });
        return;
    } if (!body.amount) {
        res.status(400).send({
            message: 'amount parametr required',
            code: 400
        });
        return;
    }

    try {

        if (body.game == 1) {
            await BetBigSmall(body.amount, "USD", id);
        } else if (body.game == 2) {
            await BetLucky(id, body.amount, "USD");
        } else if (body.game == 3) {
            await BetNuiNui(id, body.amount, "USD");
        } else if (body.game == 4) {
            await BetBankerPlayer(id, body.amount, "USD");
        } else if (body.game == 5) {
            await BetOddEven(body.amount, "USD", id);
        }

        res.json({
            code: 200,
            message: 'Ok'
        });

    } catch (err) {
        res.status(400).json({ message: err.toString(), code: 400 });
    }

});

router.get("/hash-games-addresses", async (req, res) => {
    try {
        const data = await readAllConfigs();
        res.json({ code: 200, data });
    } catch (err) {
        res.status(400).json({ code: 400, message: err.toString() });
    }
});

// Get games by extra_gameType (category name)
router.get("/by-category", async (req, res) => {
    try {
        const extraGameType = req.query.extraGameType as string;
        const page = req.query.page ? Number(req.query.page) : 1;
        const limit = req.query.limit ? Number(req.query.limit) : 100;
        // Parse visibility (language code) - if not provided or empty, default to null (show all games)
        const visibility = req.query.visibility 
            ? (req.query.visibility === 'null' || req.query.visibility === '' ? null : Number(req.query.visibility))
            : null;

        console.log('========================================');
        console.log('[API /by-category] Request received');
        console.log('Query parameters:', req.query);
        console.log('extraGameType:', extraGameType);
        console.log('page:', page);
        console.log('limit:', limit);
        console.log('visibility (language code):', visibility);
        console.log('========================================');

        if (!extraGameType) {
            console.error('[API /by-category] ERROR: extraGameType parameter is missing!');
            return res.status(400).json({ 
                code: 400, 
                message: "extraGameType parameter is required" 
            });
        }

        const result = await getGamesByExtraGameType({
            extraGameType,
            page,
            limit,
            visibility,
        });

        console.log('[API /by-category] Returning result:', {
            gamesCount: result.data.length,
            total: result.meta.total,
            category: extraGameType,
            visibility: visibility
        });

        res.json({
            code: 200,
            message: 'Games fetched successfully',
            data: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('[API /by-category] ERROR:', error);
        res.status(500).json({ code: 500, message: "Internal server error" });
    }
});

export default router;
