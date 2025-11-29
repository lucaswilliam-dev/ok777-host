import prisma from "./prisma";

interface GetGamesOptions {
  category?: number;
  page?: number;
  limit?: number;
}

export async function getGamesByCategory({
  category,
  page = 1,
  limit = 10,
}: GetGamesOptions) {
  const offset = (page - 1) * limit;

  const games = await prisma.$queryRawUnsafe(`
    SELECT *
    FROM "Games"
    WHERE "enabled" = true AND "status" = 'ACTIVATED'
      AND "inManager" = true
      AND (
        "supportCurrency" = 'ALL'
        OR "supportCurrency" ~ '(^|,)USD(,|$)'
      )
      ${category !== undefined ? `AND "category" = ${category}` : ""}
    ORDER BY "createdAt" DESC
    LIMIT ${limit} OFFSET ${offset};
  `);

  const totalResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint as count
    FROM "Games"
    WHERE "enabled" = true
      AND "inManager" = true
      AND (
        "supportCurrency" = 'ALL'
        OR "supportCurrency" ~ '(^|,)USD(,|$)'
      )
      ${category !== undefined ? `AND "category" = ${category}` : ""}
  `);

  const total = Number(totalResult[0].count);

  return {
    data: games,
    meta: {
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export const getAllCategories = async () => {
  return await prisma.gameCategory.findMany({
    orderBy: { name: "asc" },
  });
};

export async function getAllProducts() {
  return await prisma.product.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "desc" },
  });
}

// Get games by extra_gameType (category name)
export async function getGamesByExtraGameType({
  extraGameType,
  page = 1,
  limit = 100,
  visibility,
}: {
  extraGameType: string;
  page?: number;
  limit?: number;
  visibility?: number | null; // Language code for filtering (null = show all games)
}) {
  const offset = (page - 1) * limit;

  console.log(
    `[getGamesByExtraGameType] Searching for extra_gameType: "${extraGameType}", visibility: ${visibility}`
  );

  // Build where clause
  const where: any = {
    extra_gameType: extraGameType,
    inManager: true,
    status: "ACTIVATED",
    enabled: true,
  };

  // Filter by visibility if language code is provided (not null)
  // If visibility is null, show all games (English = all games)
  if (visibility !== null && visibility !== undefined) {
    where.visibility = {
      array_contains: [visibility],
    };
  }

  const games = await prisma.game.findMany({
    where,
  });

  console.log(
    `[getGamesByExtraGameType] Found ${games.length} games for "${extraGameType}" with visibility ${visibility}`
  );

  const total = await prisma.game.count({
    where,
  });

  console.log(
    `[getGamesByExtraGameType] Total count: ${total} for "${extraGameType}" with visibility ${visibility}`
  );

  return {
    data: games,
    meta: {
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
