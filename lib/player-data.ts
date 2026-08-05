const requiredObjects = ["Upgrades", "Profile", "Quest", "Settings", "Pity", "VIPReward", "Index", "CodeRedeemed", "CodesRedeemed"];
const requiredArrays = ["Inventory", "Equipped", "Items", "GiftLogs", "TradeLogs", "Evolution", "AutoSkill", "Cloning", "FlexCharacters"];

export function validatePlayerData(input: unknown, current?: unknown) {
  if (!isRecord(input)) throw new Error("Player data must be an object.");
  if (isRecord(current)) {
    for (const key of changedKeys(current, input)) validateField(key, input[key]);
    return input;
  }

  for (const key of requiredObjects) if (!isRecord(input[key])) throw new Error(`${key} must be an object.`);
  for (const key of requiredArrays) if (!Array.isArray(input[key])) throw new Error(`${key} must be an array.`);
  for (const [key, value] of Object.entries(input)) validateField(key, value);
  return input;
}

function changedKeys(current: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  return [...keys].filter((key) => stableString(current[key]) !== stableString(next[key]));
}

function stableString(value: unknown) {
  return JSON.stringify(sortForCompare(value));
}

function sortForCompare(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForCompare);
  if (isRecord(value)) return Object.keys(value).sort().reduce<Record<string, unknown>>((next, key) => {
    next[key] = sortForCompare(value[key]);
    return next;
  }, {});
  return value;
}

function validateField(key: string, value: unknown) {
  if (value === undefined) throw new Error(`${key} cannot be removed.`);
  scanValue(value, key, 0);
  if (objectFields().has(key) && !isRecord(value)) throw new Error(`${key} must be an object.`);
  if (arrayFields().has(key) && !Array.isArray(value)) throw new Error(`${key} must be an array.`);
  if (key === "Gold") numberValue(value, "Gold", 0, 1_000_000_000_000);
  if (key === "Token") numberValue(value, "Token", 0, 1_000_000_000);
  if (key === "Spin") numberValue(value, "Spin", 0, 1_000_000);
  if (key === "RobuxSpent") numberValue(value, "RobuxSpent", 0, 10_000_000_000);
  if (key === "Inventory") validateUnits(value, "Inventory");
  if (key === "Equipped") validateUnits(value, "Equipped");
  if (key === "Items") validateItems(value);
}

function objectFields() {
  return new Set(requiredObjects);
}

function arrayFields() {
  return new Set(requiredArrays);
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
  if (typeof value === "string" && (value.length > 8_000 || value.includes("\uFFFD"))) throw new Error(`${path} has invalid text.`);
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

function numberValue(value: unknown, key: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
}

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${field} is invalid.`);
}

function optionalText(value: unknown, field: string, max: number) {
  if (value !== undefined && (typeof value !== "string" || value.length > max)) throw new Error(`${field} is invalid.`);
}

function optionalNumber(value: unknown, field: string, min: number, max: number) {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${field} is invalid.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
