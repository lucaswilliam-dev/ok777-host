const crypto = require("crypto");


export function generateSign(operatorCode: any, requestTime: any, action: any, secretKey: any): string {
    const str = operatorCode + requestTime + action + secretKey;
    return crypto.createHash("md5").update(str).digest("hex");
}

export function generateLaunchGameSign(operatorCode: any, requestTime: any, secretKey: any): string {
    const str = requestTime + secretKey + "launchgame" + operatorCode;
    return crypto.createHash("md5").update(str).digest("hex");
}

export function verifyRequest(operatorCode: any, requestTime: any, action: any, secretKey: any, sign: any): boolean {
    const expected = generateSign(operatorCode, requestTime, action, secretKey);
    return expected.toLowerCase() === sign.toLowerCase();
}
