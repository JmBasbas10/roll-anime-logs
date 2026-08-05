const requiredObjects = ["Upgrades", "Profile", "Quest", "Settings", "Pity", "VIPReward"];
const requiredArrays = ["Inventory", "Equipped", "Items", "GiftLogs", "TradeLogs", "Evolution", "AutoSkill", "Cloning", "Index", "CodeRedeemed", "CodesRedeemed", "FlexCharacters"];

const defaultObjects: Record<string, unknown> = {
  Upgrades: { Slots: 4, Luck: 1, Gold: 1, Inventory: 75 },
  Profile: {
    TradeRatings: 0,
    TradeRatingCount: 0,
    Playtime: 0,
    HighestWave: 0,
    HighestCastle: 0,
    Kills: 0,
    HighestCash: 1_000,
    LastLeave: 0,
    Showcase: [],
    GiftHistory: [],
    Title: "",
    Titles: [],
    XP: 0,
    Level: 0,
    Claimed: [],
    Summons: 0,
  },
  Quest: {
    LastDailyReset: 0,
    LastWeeklyReset: 0,
    Claimed: { Daily: [], Weekly: [] },
    Progress: {
      Daily: { Roll: 0, KillTotal: 0, KillGrunts: 0, KillBoss: 0, Damage: 0, InfTowerWave: 0, SessionTime: 0 },
      Weekly: { Roll: 0, KillTotal: 0, KillGrunts: 0, KillBoss: 0, Damage: 0, InfTowerWave: 0, SessionTime: 0 },
    },
    Active: { Daily: [], Weekly: [] },
  },
  Settings: {
    FPSBoost: false,
    Effects: true,
    OtherPlayerEffects: false,
    Sounds: true,
    Music: true,
    ShowText: true,
    AutoAbility: false,
    Checkpoint: 0,
    FastForward: 2,
    AutoPlay: false,
    AutoSkill: false,
    TraitLock: {
      Sharp: false,
      Swift: false,
      Strong: false,
      Deadly: false,
      Rush: false,
      Powerful: false,
      Deadeye: true,
      Juggernaut: true,
      Lethal: true,
      Royal: true,
      Entrepreneur: true,
      Reaper: true,
      Cloner: true,
      Ghost: true,
      Superior: true,
      Cursed: true,
      Viking: true,
    },
  },
  Pity: { Legendary: 0, Mythic: 0, Secret: 0 },
  VIPReward: { LastClaimed: 0, Claimed: false },
};

const defaultValues: Record<string, unknown> = {
  Gold: 1_000,
  Token: 0,
  Spin: 1,
  SpinRechargeAt: 0,
  SpinLastClaim: 0,
  Reduce50Uses: 0,
  Reduce50EvolUses: 0,
  RobuxSpent: 0,
  Gamepasses: {},
  ProductsPurchased: {},
  PurchaseIdCache: {},
  FreeGroup: false,
  TutorialStep5Reward: false,
  CompletedTutorial: false,
  Flex: 1,
};

export function validatePlayerData(input: unknown) {
  if (!isRecord(input)) throw new Error("Player data must be an object.");
  const data = addMissingDefaults(input);
  for (const key of requiredObjects) {
    if (!isRecord(data[key])) throw new Error(`${key} must be an object.`);
  }
  for (const key of requiredArrays) {
    if (!Array.isArray(data[key])) throw new Error(`${key} must be an array.`);
  }

  scanValue(data, "Data", 0);
  numberField(data, "Gold", 0, 1_000_000_000_000);
  numberField(data, "Token", 0, 1_000_000_000);
  numberField(data, "Spin", 0, 1_000_000);
  numberField(data, "RobuxSpent", 0, 10_000_000_000);
  booleanField(data, "FreeGroup");
  booleanField(data, "TutorialStep5Reward");
  booleanField(data, "CompletedTutorial");

  validateUnits(data.Inventory, "Inventory");
  validateUnits(data.Equipped, "Equipped");
  validateItems(data.Items);
  return data;
}

function addMissingDefaults(input: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...input };
  for (const key of requiredArrays) {
    if (data[key] === undefined) data[key] = [];
  }
  for (const [key, value] of Object.entries(defaultObjects)) {
    if (data[key] === undefined) data[key] = cloneDefault(value);
  }
  for (const [key, value] of Object.entries(defaultValues)) {
    if (data[key] === undefined) data[key] = cloneDefault(value);
  }
  return data;
}

function cloneDefault(value: unknown) {
  if (Array.isArray(value) || isRecord(value)) return JSON.parse(JSON.stringify(value));
  return value;
}

function validateUnits(value: unknown, field: string) {
  if (!Array.isArray(value)) return;
  if (value.length > 10_000) throw new Error(`${field} is too large.`);
  for (const unit of value) {
    if (!isRecord(unit)) throw new Error(`${field} entries must be objects.`);
    requiredText(unit.Name, `${field}.Name`, 150);
    optionalNumber(unit.Level, `${field}.Level`, 1, 1_000_000);
    optionalText(unit.Mutation, `${field}.Mutation`, 100);
    optionalText(unit.Trait, `${field}.Trait`, 100);
    optionalText(unit.UUID, `${field}.UUID`, 200);
    optionalNumber(unit.Slot, `${field}.Slot`, 1, 100);
    optionalNumber(unit.HotbarSlot, `${field}.HotbarSlot`, 1, 100);
    if (unit.isLocked !== undefined && typeof unit.isLocked !== "boolean") throw new Error(`${field}.isLocked must be true or false.`);
  }
}

function validateItems(value: unknown) {
  if (!Array.isArray(value)) return;
  if (value.length > 10_000) throw new Error("Items is too large.");
  for (const item of value) {
    if (!isRecord(item)) throw new Error("Item entries must be objects.");
    requiredText(item.Name, "Items.Name", 150);
    optionalNumber(item.amount, "Items.amount", 0, 1_000_000_000);
  }
}

function scanValue(value: unknown, path: string, depth: number) {
  if (value === null || value === undefined) throw new Error(`${path} cannot contain null values.`);
  if (depth > 12) throw new Error(`${path} is nested too deeply.`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} must be a real number.`);
  if (typeof value === "string") {
    if (value.length > 8_000) throw new Error(`${path} has an oversized string.`);
    if (value.includes("\uFFFD")) throw new Error(`${path} contains malformed text.`);
  }
  if (Array.isArray(value)) {
    if (value.length > 10_000) throw new Error(`${path} has too many entries.`);
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, depth + 1));
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (!key || key.length > 100) throw new Error(`${path} has an invalid key.`);
      scanValue(entry, `${path}.${key}`, depth + 1);
    }
  }
}

function numberField(record: Record<string, unknown>, key: string, min: number, max: number) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
}

function booleanField(record: Record<string, unknown>, key: string) {
  if (typeof record[key] !== "boolean") throw new Error(`${key} must be true or false.`);
}

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${field} is invalid.`);
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} is invalid.`);
}

function optionalNumber(value: unknown, field: string, min: number, max: number) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${field} is invalid.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
