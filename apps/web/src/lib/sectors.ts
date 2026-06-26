export const SECTOR_MAP: Record<string, string> = {
  // Technology
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", GOOG: "Technology",
  GOOGL: "Technology", META: "Technology", AVGO: "Technology", CRM: "Technology",
  ADBE: "Technology", ORCL: "Technology", CSCO: "Technology", NET: "Technology",
  DDOG: "Technology", CRWD: "Technology", ZS: "Technology", SNOW: "Technology",
  // Semiconductors
  AMD: "Semiconductors", INTC: "Semiconductors", QCOM: "Semiconductors",
  AMAT: "Semiconductors", MU: "Semiconductors", MRVL: "Semiconductors",
  ARM: "Semiconductors", SMCI: "Semiconductors", LRCX: "Semiconductors",
  ALAB: "Semiconductors",
  // AI & Data
  PLTR: "AI & Data", SOUN: "AI & Data", IONQ: "AI & Data", RGTI: "AI & Data",
  // Fintech
  COIN: "Fintech", HOOD: "Fintech", SOFI: "Fintech", SQ: "Fintech",
  PYPL: "Fintech", AFRM: "Fintech", UPST: "Fintech",
  // Consumer
  AMZN: "Consumer", HD: "Consumer", COST: "Consumer",
  WMT: "Consumer", NKE: "Consumer", MCD: "Consumer", SBUX: "Consumer",
  TGT: "Consumer", LOW: "Consumer", SHOP: "Consumer", MELI: "Consumer",
  CHWY: "Consumer", RDDT: "Consumer", CELH: "Consumer",
  // EV & Clean Energy
  TSLA: "EV & Energy", RIVN: "EV & Energy", LCID: "EV & Energy",
  NIO: "EV & Energy", ENPH: "EV & Energy", FSLR: "EV & Energy", VRT: "EV & Energy",
  // Healthcare & Biotech
  UNH: "Healthcare", JNJ: "Healthcare", LLY: "Healthcare", MRK: "Healthcare",
  ABBV: "Healthcare", PFE: "Healthcare", TMO: "Healthcare", ABT: "Healthcare",
  BMY: "Healthcare", AMGN: "Healthcare", MRNA: "Healthcare", BNTX: "Healthcare",
  RXRX: "Healthcare",
  // Finance
  JPM: "Finance", V: "Finance", MA: "Finance", BAC: "Finance",
  GS: "Finance", MS: "Finance", BLK: "Finance", SCHW: "Finance",
  AXP: "Finance", C: "Finance",
  // Energy
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy",
  EOG: "Energy", MPC: "Energy", PSX: "Energy", VLO: "Energy",
  // Defense & Space
  LMT: "Defense & Space", RTX: "Defense & Space", HII: "Defense & Space",
  KTOS: "Defense & Space", RKLB: "Defense & Space", ASTS: "Defense & Space",
  LUNR: "Defense & Space",
  // Industrials
  CAT: "Industrials", BA: "Industrials", HON: "Industrials", UPS: "Industrials",
  DE: "Industrials", GE: "Industrials",
  // Communication & Media
  NFLX: "Communication", DIS: "Communication", CMCSA: "Communication", T: "Communication",
  VZ: "Communication", TMUS: "Communication",
  // Consumer Staples
  PG: "Staples", KO: "Staples", PEP: "Staples", PM: "Staples", CL: "Staples",
  // Meme & Momentum
  GME: "Momentum", AMC: "Momentum", MSTR: "Momentum",
};

export const SECTORS = Array.from(new Set(Object.values(SECTOR_MAP)));
