// Single source of truth — ported verbatim from the reference wireframe.
// Used by the seed script and as static fallbacks/constants in the app.

export type Centre = { id: string; name: string; short: string };
export type Store = {
  id: string;
  centreId: string;
  name: string;
  cat: string;
  initial: string;
  live: boolean;
  fb7d: number;
};
export type Category = { id: string; name: string };

export const centres: Centre[] = [
  { id: "ccg", name: "Cyber City, Gurgaon", short: "Cyber City · GGN" },
  { id: "vt", name: "Vaishnavi Tech Park, Bangalore", short: "Vaishnavi · BLR" },
  { id: "oc", name: "Olympia Cyberspace, Chennai", short: "Olympia · CHN" },
  { id: "bkc", name: "BKC, Mumbai", short: "BKC · MUM" },
];

export const stores: Store[] = [
  { id: "cp", centreId: "ccg", name: "Chai Point", cat: "Beverages", initial: "C", live: true, fb7d: 28 },
  { id: "sw", centreId: "ccg", name: "Subway", cat: "QSR", initial: "S", live: true, fb7d: 41 },
  { id: "fm", centreId: "ccg", name: "FreshMenu", cat: "Meals", initial: "F", live: true, fb7d: 33 },
  { id: "bb", centreId: "ccg", name: "Blue Tokai", cat: "Coffee", initial: "B", live: false, fb7d: 0 },
  { id: "wp", centreId: "ccg", name: "Wraps & Co.", cat: "QSR", initial: "W", live: false, fb7d: 0 },
  { id: "tw", centreId: "ccg", name: "Theobroma", cat: "Bakery", initial: "T", live: false, fb7d: 0 },
  { id: "cb", centreId: "vt", name: "Cafe Belucci", cat: "Coffee", initial: "C", live: true, fb7d: 19 },
  { id: "br", centreId: "vt", name: "Behrouz", cat: "Meals", initial: "B", live: true, fb7d: 22 },
  { id: "a1", centreId: "oc", name: "Annapoorna", cat: "South Indian", initial: "A", live: true, fb7d: 31 },
  { id: "s2", centreId: "bkc", name: "Starbucks", cat: "Coffee", initial: "S", live: true, fb7d: 18 },
  { id: "mc", centreId: "bkc", name: "McDonald's", cat: "QSR", initial: "M", live: false, fb7d: 0 },
];

// Fixed catalogue of rating categories — which ones are *active* is stored per centre.
export const allCategories: Category[] = [
  { id: "taste", name: "Taste" },
  { id: "quality", name: "Food quality" },
  { id: "hygiene", name: "Hygiene" },
  { id: "portion", name: "Portion size" },
  { id: "speed", name: "Service speed" },
  { id: "staff", name: "Staff behaviour" },
  { id: "value", name: "Value for money" },
  { id: "variety", name: "Variety" },
  { id: "temp", name: "Temperature" },
];

export const defaultActiveCategories = ["taste", "quality", "hygiene", "speed", "value"];
export const defaultPosTags = ["Tasty", "Fresh", "Warm", "Generous portion", "Friendly staff", "Quick service", "Good value", "Clean"];
export const defaultNegTags = ["Cold", "Too salty", "Stale", "Small portion", "Slow service", "Rude staff", "Overpriced", "Hygiene concern"];

export type Routing = {
  dailyDigest: boolean;
  autoTicketLow: boolean;
  rollupDashboard: boolean;
  slackAlertLow: boolean;
};

export const defaultRouting: Routing = {
  dailyDigest: true,
  autoTicketLow: true,
  rollupDashboard: true,
  slackAlertLow: false,
};

export const ratingWords = ["", "Poor", "Okay", "Good", "Great", "Excellent"];
export const DEVICE_ID = "TAB-CCG-CAFE-04";
