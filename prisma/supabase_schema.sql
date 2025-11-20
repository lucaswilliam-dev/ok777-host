-- Supabase-compatible schema generated from prisma/schema.prisma
-- Paste this into Supabase SQL editor and run.
-- Extensions (UUID generation)
create extension if not exists pgcrypto;

-- ===================== TABLES =====================

-- Admins
create table if not exists "Admins" (
  id serial primary key,
  email text unique not null,
  password text not null,
  role text not null,
  status text not null
);

-- Users
create table if not exists "Users" (
  id serial primary key,
  email text unique not null,
  password text not null,
  role text not null,
  status text not null,
  telegram text,
  avatar text,
  withdrawal_password text,
  name text,
  phone text,
  email_verified boolean not null default false,
  "referralCode" text unique,
  referredById integer,
  constraint users_referredby_fk foreign key (referredById) references "Users"(id)
);

-- EmailVerificationCodes
create table if not exists "EmailVerificationCodes" (
  id serial primary key,
  userId integer not null,
  code text not null,
  used boolean not null default false,
  createdAt timestamptz not null default now(),
  expiresAt timestamptz not null
);

-- Balances
create table if not exists "Balances" (
  id uuid primary key default gen_random_uuid(),
  userId integer not null,
  currency text not null,
  amount numeric(18,4) not null default 0.0000,
  lock numeric(38,18) not null default 0,
  updatedAt timestamptz not null default now(),
  constraint balances_user_fk foreign key (userId) references "Users"(id)
);
create unique index if not exists balances_user_currency_uq on "Balances" ("userId", "currency");

-- Wallets
create table if not exists "Wallets" (
  id uuid primary key default gen_random_uuid(),
  userId integer not null,
  blockchain text not null,
  network text not null,
  publicKey text not null unique,
  privateKey text not null,
  tagOrMemo text,
  createdAt timestamptz not null default now(),
  constraint wallets_user_fk foreign key (userId) references "Users"(id)
);
create unique index if not exists wallets_user_chain_network_uq on "Wallets" ("userId", "blockchain", "network");

-- Transactions
create table if not exists "Transactions" (
  id serial primary key,
  userId integer not null,
  address text not null,
  currency text not null,
  amount numeric(38,18) not null,
  txId text not null,
  createdAt timestamptz not null default now(),
  type text not null,
  constraint transactions_user_fk foreign key (userId) references "Users"(id)
);

-- Deposits
create table if not exists "Deposits" (
  id serial primary key,
  "userId" integer not null,
  "orderId" text unique not null,
  "txHash" text unique not null,
  "fromAddress" text,
  "toAddress" text not null,
  currency text not null,
  network text not null,
  amount numeric(38,18) not null,
  rate numeric(38,18),
  "realArrival" numeric(38,18),
  status text not null default 'pending',
  type text not null default 'crypto',
  "blockNumber" bigint,
  confirmations integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "confirmedAt" timestamptz,
  constraint deposits_user_fk foreign key ("userId") references "Users"(id)
);
create index if not exists deposits_user_id_idx on "Deposits" ("userId");
create index if not exists deposits_status_idx on "Deposits" (status);
create index if not exists deposits_created_at_idx on "Deposits" ("createdAt");

-- Bets
create table if not exists "Bets" (
  id uuid primary key default gen_random_uuid(),
  txHash text unique,
  player text,
  token text not null,
  amount double precision not null,
  direction text not null,
  result text,
  status text not null,
  payout double precision,
  blockNum integer not null,
  createdAt timestamptz not null default now(),
  game integer not null,
  type integer not null,
  userId integer,
  constraint bets_user_fk foreign key (userId) references "Users"(id)
);

-- Logs
create table if not exists "Logs" (
  id serial primary key,
  userId integer not null,
  adminId integer not null,
  type text not null,
  description text not null,
  createdAt timestamptz not null default now()
);

-- HashGameConfigs
create table if not exists "HashGameConfigs" (
  id integer primary key default 1,
  type text not null,
  bigSmallHouseAddress text not null,
  luckyHouseAddress text not null,
  niuNiuHouseAddress text not null,
  bankerPlayerHouseAddress text not null,
  oddEvenHouseAddress text not null,
  updatedAt timestamptz not null default now()
);

-- GameSettings
create table if not exists "GameSettings" (
  id integer primary key default 1,
  oddsNumerator integer not null,
  oddsDenominator integer not null,
  feeNumerator integer not null,
  feeDenominator integer not null,
  trxMin integer not null,
  trxMax integer not null,
  usdtMin integer not null,
  usdtMax integer not null,
  updatedAt timestamptz not null default now()
);

-- Payouts
create table if not exists "Payouts" (
  id serial primary key,
  to text,
  status text not null,
  currency text not null,
  amount integer not null,
  userId integer
);

-- Product
create table if not exists "Product" (
  id serial primary key,
  provider text not null,
  currency text not null,
  status text not null,
  providerId integer not null,
  code integer not null unique,
  name text not null,
  gameType text not null,
  title text not null,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  enabled boolean not null,
  image text
);

-- GameCategories
create table if not exists "GameCategories" (
  id serial primary key,
  name text not null unique,
  icon text,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- ReferralBonuses
create table if not exists "ReferralBonuses" (
  id serial primary key,
  userId integer not null,
  fromUserId integer not null,
  amount integer not null,
  currency text not null,
  status text not null default 'pending',
  triggerType text not null default 'deposit',
  expiresAt timestamptz,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  constraint referral_to_fk foreign key (userId) references "Users"(id),
  constraint referral_from_fk foreign key (fromUserId) references "Users"(id)
);

-- ReferralConfigs
create table if not exists "ReferralConfigs" (
  id integer primary key default 1,
  depositBonusPercent integer not null default 5,
  betBonusPercent integer not null default 2,
  firstDepositBonus integer not null default 10,
  firstBetBonus integer not null default 5,
  signupBonus integer not null default 5,
  maxBonusPerUser integer not null default 1000,
  bonusExpiryDays integer not null default 30,
  enabled boolean not null default true,
  updatedAt timestamptz not null default now()
);

-- Games
create table if not exists "Games" (
  id serial primary key,
  gameCode text not null,
  gameName text not null,
  gameType text not null,
  imageUrl text not null,
  productId integer not null,
  productCode integer not null,
  supportCurrency text not null,
  status text not null,
  allowFreeRound boolean not null,
  langName jsonb not null,
  langIcon jsonb not null,
  category integer,
  enabled boolean not null default true,
  provider text,
  extra_gameType text,
  extra_provider text,
  extra_gameName text,
  extra_langName jsonb,
  extra_imageUrl text,
  coverImage jsonb,
  isHot boolean not null default false,
  isNew boolean not null default false,
  isRecommended boolean not null default false,
  onlinePlayers integer,
  launchParams jsonb,
  visibility jsonb,
  aggregator text,
  inManager boolean not null default false,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- TempGames
create table if not exists "TempGames" (
  id serial primary key,
  gameCode text not null,
  gameName text not null,
  gameType text not null,
  imageUrl text not null,
  productId integer not null,
  productCode integer not null,
  supportCurrency text not null,
  status text not null,
  allowFreeRound boolean not null,
  langName jsonb not null,
  langIcon jsonb not null,
  category integer,
  enabled boolean not null default true,
  provider text,
  coverImage jsonb,
  isHot boolean not null default false,
  isNew boolean not null default false,
  isRecommended boolean not null default false,
  onlinePlayers integer,
  launchParams jsonb,
  visibility jsonb,
  aggregator text,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- WithdrawRequests
create table if not exists "WithdrawRequests" (
  id serial primary key,
  to text not null,
  currency text not null,
  blockchain text not null,
  status text not null,
  amount integer not null,
  userId integer
);

-- Wagers
create table if not exists "Wagers" (
  wagerCode text primary key,
  id text,
  userId integer not null,
  action text,
  wagerStatus text not null,
  roundId text not null,
  channelCode text,
  wagerType text,
  amount numeric(38,18),
  betAmount numeric(38,18) not null,
  validBetAmount numeric(38,18) not null,
  prizeAmount numeric(38,18) not null,
  tipAmount numeric(38,18) not null,
  settledAt bigint not null,
  gameCode text not null,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  currency text not null default 'USD',
  payload jsonb
);

-- Helpful indexes
create index if not exists idx_transactions_user on "Transactions" ("userId");
create index if not exists idx_balances_user on "Balances" ("userId");
create index if not exists idx_wallets_user on "Wallets" ("userId");