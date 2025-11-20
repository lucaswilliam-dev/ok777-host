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
}: {
  extraGameType: string;
  page?: number;
  limit?: number;
}) {
  const offset = (page - 1) * limit;

  console.log(
    `[getGamesByExtraGameType] Searching for extra_gameType: "${extraGameType}"`
  );

  // Use case-insensitive matching for extra_gameType
  // PostgreSQL supports case-insensitive matching with mode: 'insensitive'
  // const games = await prisma.game.findMany({
  //   where: {
  //     AND: [
  //       { enabled: true },
  //       { status: "ACTIVATED" },
  //       { inManager: true }, // Only games added in game manager
  //       {
  //         extra_gameType: {
  //           equals: extraGameType,
  //           mode: "insensitive", // Case-insensitive match
  //         },
  //       },
  //       {
  //         OR: [
  //           { supportCurrency: "ALL" },
  //           { supportCurrency: { contains: "USD" } },
  //         ],
  //       },
  //     ],
  //   },
  //   orderBy: { createdAt: "desc" },
  //   take: limit,
  //   skip: offset,
  // });

  const games = await prisma.game.findMany({
    where: {
      extra_gameType: extraGameType,
      inManager: true,
      status: "ACTIVATED",
      enabled: true,
    },
  });

  console.log(
    `[getGamesByExtraGameType] Found ${games.length} games for "${extraGameType}"`
  );

  const total = await prisma.game.count({
    where: {
      extra_gameType: extraGameType,
      inManager: true,
      status: "ACTIVATED",
      enabled: true,
    },
  });

  console.log(
    `[getGamesByExtraGameType] Total count: ${total} for "${extraGameType}"`
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
