import prisma from "./prisma";

export const fetchWagers = async (
  skip: number,
  take: number,
  startTime?: number,
  endTime?: number
) => {
  const where: any = {};
  if (startTime || endTime) {
    where.createdAt = {};
    if (startTime) where.createdAt.gte = new Date(startTime);
    if (endTime) where.createdAt.lte = new Date(endTime);
  }

  const [wagers, total] = await Promise.all([
    prisma.wager.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.wager.count({ where }),
  ]);

  return { wagers, total };
};

export const listWagers = async (
  page: number,
  size: number,
  start?: number,
  end?: number
) => {
  const skip = (page - 1) * size;
  const { wagers, total } = await fetchWagers(skip, size, start, end);

  const mapped = wagers.map((w) => ({
    id: w.id,
    code: w.wagerCode,
    member_account: String(w.userId),
    round_id: w.roundId,
    currency: w.currency,
    provider_id: 0,
    provider_line_id: 0,
    provider_product_id: 0,
    provider_product_oid: 1138,
    game_type: w.wagerType,
    game_code: w.gameCode,
    valid_bet_amount: Number(w.validBetAmount),
    bet_amount: Number(w.betAmount),
    prize_amount: Number(w.prizeAmount),
    status: w.wagerStatus,
    payload: w.payload ?? null,
    settled_at: Number(w.settledAt ?? 0),
    created_at: w.createdAt.getTime(),
    updated_at: w.updatedAt.getTime(),
  }));

  return {
    wagers: mapped,
    pagination: {
      size,
      total,
    },
  };
};

export const fetchWagerById = async (wagerCode: string) => {
  return prisma.wager.findUnique({ where: { wagerCode } });
};

export const fetchWagerByCode = async (wagerCode: string) => {
  return prisma.wager.findFirst({ where: { wagerCode } });
};

export const getWager = async (key: string) => {
  const wager = /^\d+$/.test(key)
    ? await fetchWagerById(key)
    : await fetchWagerByCode(key);

  if (!wager) return null;

  return {
    id: wager.id,
    code: wager.wagerCode,
    member_account: String(wager.userId),
    round_id: wager.roundId,
    currency: wager.currency,
    provider_id: 0,
    provider_line_id: 0,
    provider_product_id: 0,
    provider_product_oid: 1138,
    game_type: wager.wagerType,
    game_code: wager.gameCode,
    valid_bet_amount: Number(wager.validBetAmount),
    bet_amount: Number(wager.betAmount),
    prize_amount: Number(wager.prizeAmount),
    status: wager.wagerStatus,
    payload: wager.payload ?? null,
    settled_at: Number(wager.settledAt ?? 0),
    created_at: wager.createdAt.getTime(),
    updated_at: wager.updatedAt.getTime(),
  };
};

export const saveProduct = async (product: any) => {
  return prisma.product.upsert({
    where: { code: product.product_code },
    update: {
      provider: product.provider,
      currency: product.currency,
      status: product.status,
      providerId: product.provider_id,
      name: product.product_name,
      gameType: product.game_type,
      title: product.product_title,
      enabled: true,
    },
    create: {
      provider: product.provider,
      currency: product.currency,
      status: product.status,
      providerId: product.provider_id,
      code: product.product_code,
      name: product.product_name,
      gameType: product.game_type,
      title: product.product_title,
      enabled: true,
    },
  });
};

export const saveProductsBulk = async (products: any[]) => {
  return Promise.all(products.map((p) => saveProduct(p)));
};