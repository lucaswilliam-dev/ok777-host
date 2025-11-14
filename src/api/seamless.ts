import express from 'express';
import { getUserBalancesBulk, processWithdraw, processDeposit, processPushBet } from '../db/gsc';
import { verifyRequest } from '../utils/gsc';
const crypto = require("crypto");
const axios = require("axios");

const OPERATOR_CODE = process.env.OPERATOR_CODE;
const SECRET_KEY = process.env.SECRET_KEY || "";
const OPERATOR_URL = "https://staging.gsimw.com";

const router = express.Router();

async function getProviderGames() {

    const requestTime = Math.floor(Date.now() / 1000);
    const sign = crypto
        .createHash("md5")
        .update(requestTime + SECRET_KEY + "gamelist" + OPERATOR_CODE)
        .digest("hex");

    const res = await axios.get(`${OPERATOR_URL}/api/operators/provider-games`, {
        params: {
            operator_code: OPERATOR_CODE,
            request_time: requestTime,
            sign: sign,
            product_code: 1020
        },
        headers: {
            "Content-Type": "application/json"
        }
    });

    return res.data;
}

router.post('/balance', async (req, res) => {
    // console.log("balance")

    const { operator_code, sign, request_time, batch_requests, currency } = req.body;
    // console.log(req.body)
    if (!verifyRequest(operator_code, request_time, "getbalance", SECRET_KEY, sign)) {
        return res.status(200).json({ code: -1, message: "Invalid signature" });
    }

    const data = await getUserBalancesBulk(batch_requests, currency);
    console.log({ data })
    res.json({ data });

});

router.post('/get-games', async (req, res) => {

    try {
        const data = await getProviderGames()
        res.json({ data: data });

    } catch (err: any) {
        console.error("❌ Request failed:", err.response?.data || err.message);
    }

});

function isNumeric(num: any): boolean {
    return !isNaN(num)
}


router.post("/withdraw", async (req, res) => {

    const { operator_code, sign, request_time, batch_requests, currency } = req.body;

    if (!verifyRequest(operator_code, request_time, "withdraw", SECRET_KEY, sign)) {
        return res.status(200).json({ code: -1, message: "Invalid signature" });
    }

    try {
        const results = await Promise.all(
            batch_requests.map(async (reqItem: any) => {
                if (!isNumeric(reqItem.member_account)) {
                    return {
                        member_account: reqItem.member_account,
                        product_code: reqItem.product_code,
                        before_balance: 0,
                        balance: 0,
                        code: 1000,
                        message: "Member not Exist",
                    }
                }
                try {
                    const wagerData = reqItem.transactions[0];
                    if (wagerData.action == "INVALID_ACTION") {
                        return {
                            member_account: reqItem.member_account,
                            product_code: reqItem.product_code,
                            before_balance: 0,
                            balance: 0,
                            code: 1001,
                            message: "INVALID_ACTION",
                        }
                    }
                    const result = await processWithdraw(reqItem.member_account, currency, wagerData);

                    return {
                        member_account: reqItem.member_account,
                        product_code: reqItem.product_code,
                        before_balance: result.beforeBalance,
                        balance: result.balance,
                        code: result.code,
                        message: result.message,
                    };
                } catch (err: any) {
                    return {
                        member_account: reqItem.member_account,
                        product_code: reqItem.product_code,
                        before_balance: 0,
                        balance: 0,
                        code: 1001,
                        message: err.message,
                    };
                }
            })
        );

        res.json({ data: results });

    } catch (err) {
        console.error("Withdraw error:", err);
        res.status(500).json({ code: -99, message: "Internal server error" });
    }

});


router.post("/deposit", async (req, res) => {

    const { operator_code, sign, request_time, batch_requests, currency } = req.body;

    if (!verifyRequest(operator_code, request_time, "deposit", SECRET_KEY, sign)) {
        return res.status(400).json({ code: -1, message: "Invalid signature" });
    }

    try {
        const results = await Promise.all(
            batch_requests.map(async (reqItem: any) => {
                try {
                    const wagerData = reqItem.transactions[0];

                    if (!isNumeric(reqItem.member_account)) {
                        return {
                            member_account: reqItem.member_account,
                            product_code: reqItem.product_code,
                            before_balance: 0,
                            balance: 0,
                            code: 1000,
                            message: "Member not Exist",
                        }
                    }
                    const result = await processDeposit(reqItem.member_account, currency, wagerData);

                    return {
                        member_account: reqItem.member_account,
                        product_code: reqItem.product_code,
                        before_balance: result.beforeBalance,
                        balance: result.balance,
                        code: result.code,
                        message: result.message,
                    };
                } catch (err: any) {
                    return {
                        member_account: reqItem.member_account,
                        product_code: reqItem.product_code,
                        before_balance: 0,
                        balance: 0,
                        code: -2,
                        message: err.message,
                    };
                }
            })
        );

        res.json({ data: results });
    } catch (err) {
        console.error("Deposit error:", err);
        res.status(500).json({ code: -99, message: "Internal server error" });
    }


});

router.post("/pushbetdata", async (req, res) => {

    const { operator_code, wagers, sign, request_time } = req.body;

    if (!verifyRequest(operator_code, request_time, "pushbetdata", SECRET_KEY, sign)) {
        return res.status(400).json({ code: -1, message: "Invalid signature" });
    }
    try {
        let code = 0;
        const results = await Promise.all(
            wagers.map(async (wager: any) => {
                if (!isNumeric(wager.member_account)) {
                    code = 1000;
                }
                try {
                    const result = await processPushBet(wager);
                    return {
                        member_account: wager.member_account,
                        product_code: wager.product_code,
                        balance: result.balance,
                        code: result.code,
                        message: result.message,
                    };
                } catch (err: any) {
                    console.log(err)
                    return {
                        member_account: wager.member_account,
                        product_code: wager.product_code,
                        balance: 0,
                        code: -2,
                        message: err.message,
                    };
                }
            })
        );

        res.json({
            code: code, message: "test"
        });
    } catch (err) {
        console.error("PushBet error:", err);
        res.status(500).json({ code: -99, message: "Internal server error" });
    }
});



export default router;
