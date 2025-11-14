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
    orderBy: { createdAt: 'desc' },
  });
}