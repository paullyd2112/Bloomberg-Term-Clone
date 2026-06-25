export const SECTOR_MAP: Record<string, string> = {
  // Tech
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", GOOG: "Technology",
  META: "Technology", AVGO: "Technology", CRM: "Technology", ADBE: "Technology",
  AMD: "Technology", INTC: "Technology", ORCL: "Technology", CSCO: "Technology",
  QCOM: "Technology", AMAT: "Technology", MU: "Technology", PLTR: "Technology",
  // Consumer
  AMZN: "Consumer", TSLA: "Consumer", HD: "Consumer", COST: "Consumer",
  WMT: "Consumer", NKE: "Consumer", MCD: "Consumer", SBUX: "Consumer",
  TGT: "Consumer", LOW: "Consumer",
  // Healthcare
  UNH: "Healthcare", JNJ: "Healthcare", LLY: "Healthcare", MRK: "Healthcare",
  ABBV: "Healthcare", PFE: "Healthcare", TMO: "Healthcare", ABT: "Healthcare",
  BMY: "Healthcare", AMGN: "Healthcare",
  // Finance
  JPM: "Finance", V: "Finance", MA: "Finance", BAC: "Finance",
  GS: "Finance", MS: "Finance", BLK: "Finance", SCHW: "Finance",
  AXP: "Finance", C: "Finance",
  // Energy
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy",
  EOG: "Energy", MPC: "Energy", PSX: "Energy", VLO: "Energy",
  // Industrials
  CAT: "Industrials", BA: "Industrials", HON: "Industrials", UPS: "Industrials",
  RTX: "Industrials", DE: "Industrials", LMT: "Industrials", GE: "Industrials",
  // Comm/Media
  NFLX: "Communication", DIS: "Communication", CMCSA: "Communication", T: "Communication",
  VZ: "Communication", TMUS: "Communication",
  // Consumer Staples
  PG: "Staples", KO: "Staples", PEP: "Staples", PM: "Staples", CL: "Staples",
};

export const SECTORS = Array.from(new Set(Object.values(SECTOR_MAP)));
