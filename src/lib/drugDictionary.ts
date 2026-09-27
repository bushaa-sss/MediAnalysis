export interface DrugEntry {
  generic: string;
  brands: string[];
  category: string;
}

export interface DrugMatch {
  canonicalName: string;
  score: number;
  alternatives: string[];
  category: string;
  matchedTerm: string;
}

const GENERIC_DRUGS = [
  "acetaminophen",
  "acyclovir",
  "albendazole",
  "albuterol",
  "allopurinol",
  "alprazolam",
  "amiodarone",
  "amlodipine",
  "amoxicillin",
  "amoxiclav",
  "ampicillin",
  "aspirin",
  "atenolol",
  "atorvastatin",
  "azithromycin",
  "beclomethasone",
  "benzathine penicillin",
  "bisoprolol",
  "budesonide",
  "calcium carbonate",
  "calcium vitamin d",
  "carbamazepine",
  "carvedilol",
  "cefadroxil",
  "cefixime",
  "cefixime clavulanate",
  "cefpodoxime",
  "cefspan",
  "ceftriaxone",
  "cefuroxime",
  "celecoxib",
  "cetirizine",
  "chlorthalidone",
  "ciprofloxacin",
  "clarithromycin",
  "clindamycin",
  "clotrimazole",
  "clobetasol",
  "clonazepam",
  "clopidogrel",
  "co amoxiclav",
  "diclofenac",
  "diclofenac sodium",
  "dicyclomine",
  "domperidone",
  "digoxin",
  "doxycycline",
  "empagliflozin",
  "enalapril",
  "esomeprazole",
  "etoricoxib",
  "famotidine",
  "fenofibrate",
  "ferrous sulfate",
  "fexofenadine",
  "fluconazole",
  "fluoxetine",
  "folic acid",
  "frusemide",
  "furosemide",
  "gabapentin",
  "gliclazide",
  "glimepiride",
  "glipizide",
  "hydrochlorothiazide",
  "hydrocortisone",
  "ibuprofen",
  "indapamide",
  "insulin glargine",
  "insulin lispro",
  "isotretinoin",
  "itraconazole",
  "ivermectin",
  "lansoprazole",
  "latanoprost",
  "levofloxacin",
  "levocetirizine",
  "levothyroxine",
  "linezolid",
  "loratadine",
  "losartan",
  "metformin",
  "methotrexate",
  "methylcobalamin",
  "metoclopramide",
  "metoprolol",
  "metronidazole",
  "miconazole",
  "montelukast",
  "moxifloxacin",
  "naproxen",
  "nebivolol",
  "nifedipine",
  "nitrofurantoin",
  "ofloxacin",
  "olmesartan",
  "omeprazole",
  "ondansetron",
  "pantoprazole",
  "paracetamol",
  "prednisolone",
  "pregabalin",
  "propranolol",
  "rabeprazole",
  "ramipril",
  "ranitidine",
  "rosuvastatin",
  "salbutamol",
  "sertraline",
  "sitagliptin",
  "spironolactone",
  "sucralfate",
  "telmisartan",
  "terbinafine",
  "tizanidine",
  "torsemide",
  "tramadol",
  "valsartan",
  "vitamin b complex",
  "vitamin d3",
  "warfarin",
  "zinc sulfate",
  "zincovit",
] as const;

const BRAND_MAP: Record<string, string[]> = {
  "amoxiclav": ["augmentin", "curam", "moxikind cv"],
  "co amoxiclav": ["augmentin", "curam", "clamoxin"],
  "paracetamol": ["panadol", "calpol", "tylenol", "crocin", "dolo"],
  "metformin": ["glucophage", "glumetza", "fortamet", "glycomet"],
  "atorvastatin": ["lipitor", "atorva", "storvas"],
  "rosuvastatin": ["crestor", "rosuvas"],
  "pantoprazole": ["pantocid", "pantop", "pan"],
  "rabeprazole": ["rablet", "rabicip"],
  "omeprazole": ["prilosec", "omez"],
  "cefixime": ["cefspan", "taxim o", "zifi"],
  "ceftriaxone": ["rocephin", "taxim"],
  "azithromycin": ["azee", "zithromax", "azithral"],
  "diclofenac": ["voveran", "diclo"],
  "diclofenac sodium": ["voveran"],
  "levocetirizine": ["xyzal", "levocet"],
  "cetirizine": ["cetzine", "zyrtec"],
  "losartan": ["losar", "repace"],
  "telmisartan": ["telma", "telsar"],
  "olmesartan": ["olmezest", "olmat"],
  "amlodipine": ["norvasc", "amlong", "amlodac"],
  "metoprolol": ["betaloc", "metolar"],
  "glimepiride": ["amaryl", "glimy"],
  "gliclazide": ["diamicron"],
  "sitagliptin": ["januvia", "istamet"],
  "empagliflozin": ["jardiance"],
  "pregabalin": ["lyrica", "nervigesic"],
  "gabapentin": ["gabapin", "neurotin"],
  "tramadol": ["ultram", "tramazac"],
  "ibuprofen": ["brufen", "advil"],
  "naproxen": ["naprosyn"],
  "ondansetron": ["zofran", "ondem"],
  "domperidone": ["domstal", "motilium"],
  "digoxin": ["lanoxin", "zolanix"],
  "levothyroxine": ["thyronorm", "synthroid"],
  "clopidogrel": ["plavix", "clopilet"],
  "warfarin": ["coumadin"],
  "nitrofurantoin": ["nitrofur", "furadantin"],
  "furosemide": ["lasix"],
  "frusemide": ["lasix"],
  "montelukast": ["montek", "singulair"],
  "salbutamol": ["ventolin", "asthalin"],
  "albuterol": ["ventolin"],
  "linezolid": ["zyvox"],
  "moxifloxacin": ["avelox", "moxicip"],
  "ciprofloxacin": ["ciplox", "ciprobid"],
  "levofloxacin": ["levoflox", "levaquin"],
  "clarithromycin": ["claribid", "klacid"],
  "fluconazole": ["diflucan", "forcan"],
  "clotrimazole": ["canesten", "candid", "clocip"],
  "miconazole": ["daktarin"],
  "terbinafine": ["lamisil"],
  "folic acid": ["folvite"],
  "ferrous sulfate": ["fefol", "autrin"],
  "methylcobalamin": ["nurokind", "mecobal"],
  "doxycycline": ["doxicip", "vibramycin"],
  "esomeprazole": ["nexium", "esomac"],
  "famotidine": ["pepcid"],
  "sertraline": ["zoloft"],
  "fluoxetine": ["prozac"],
  "alprazolam": ["xanax"],
  "clonazepam": ["rivotril"],
  "insulin glargine": ["lantus", "basalog"],
  "insulin lispro": ["humalog"],
};

const CATEGORY_MAP: Record<string, string> = {
  "amoxicillin": "Antibiotic",
  "amoxiclav": "Antibiotic",
  "co amoxiclav": "Antibiotic",
  "azithromycin": "Antibiotic",
  "cefixime": "Antibiotic",
  "cefspan": "Antibiotic",
  "cefpodoxime": "Antibiotic",
  "ceftriaxone": "Antibiotic",
  "cefuroxime": "Antibiotic",
  "ciprofloxacin": "Antibiotic",
  "levofloxacin": "Antibiotic",
  "moxifloxacin": "Antibiotic",
  "clarithromycin": "Antibiotic",
  "doxycycline": "Antibiotic",
  "linezolid": "Antibiotic",
  "clindamycin": "Antibiotic",
  "metronidazole": "Antiprotozoal",
  "digoxin": "Cardiac Glycoside",
  "fluconazole": "Antifungal",
  "clotrimazole": "Antifungal",
  "miconazole": "Antifungal",
  "itraconazole": "Antifungal",
  "terbinafine": "Antifungal",
  "metformin": "Antidiabetic",
  "glimepiride": "Antidiabetic",
  "gliclazide": "Antidiabetic",
  "glipizide": "Antidiabetic",
  "sitagliptin": "Antidiabetic",
  "empagliflozin": "Antidiabetic",
  "insulin glargine": "Antidiabetic",
  "insulin lispro": "Antidiabetic",
  "amlodipine": "Antihypertensive",
  "losartan": "Antihypertensive",
  "telmisartan": "Antihypertensive",
  "olmesartan": "Antihypertensive",
  "enalapril": "Antihypertensive",
  "ramipril": "Antihypertensive",
  "atenolol": "Beta Blocker",
  "metoprolol": "Beta Blocker",
  "bisoprolol": "Beta Blocker",
  "nebivolol": "Beta Blocker",
  "propranolol": "Beta Blocker",
  "atorvastatin": "Lipid Lowering",
  "rosuvastatin": "Lipid Lowering",
  "fenofibrate": "Lipid Lowering",
  "aspirin": "Antiplatelet",
  "clopidogrel": "Antiplatelet",
  "warfarin": "Anticoagulant",
  "pantoprazole": "PPI",
  "rabeprazole": "PPI",
  "omeprazole": "PPI",
  "esomeprazole": "PPI",
  "famotidine": "H2 Blocker",
  "paracetamol": "Analgesic",
  "acetaminophen": "Analgesic",
  "diclofenac": "NSAID",
  "diclofenac sodium": "NSAID",
  "ibuprofen": "NSAID",
  "naproxen": "NSAID",
  "celecoxib": "NSAID",
  "etoricoxib": "NSAID",
  "tramadol": "Analgesic",
  "ondansetron": "Antiemetic",
  "domperidone": "Antiemetic",
  "metoclopramide": "Antiemetic",
  "levocetirizine": "Antihistamine",
  "cetirizine": "Antihistamine",
  "loratadine": "Antihistamine",
  "fexofenadine": "Antihistamine",
  "prednisolone": "Corticosteroid",
  "hydrocortisone": "Corticosteroid",
  "clobetasol": "Topical Steroid",
  "montelukast": "Anti-allergic",
  "salbutamol": "Bronchodilator",
  "albuterol": "Bronchodilator",
  "levothyroxine": "Thyroid",
  "pregabalin": "Neuropathic Pain",
  "gabapentin": "Neuropathic Pain",
  "carbamazepine": "Anticonvulsant",
  "sertraline": "Antidepressant",
  "fluoxetine": "Antidepressant",
  "alprazolam": "Anxiolytic",
  "clonazepam": "Anxiolytic",
  "nitrofurantoin": "Urinary Antibiotic",
  "furosemide": "Diuretic",
  "frusemide": "Diuretic",
  "spironolactone": "Diuretic",
  "torsemide": "Diuretic",
  "hydrochlorothiazide": "Diuretic",
  "chlorthalidone": "Diuretic",
  "indapamide": "Diuretic",
  "ferrous sulfate": "Supplement",
  "folic acid": "Supplement",
  "calcium carbonate": "Supplement",
  "calcium vitamin d": "Supplement",
  "vitamin b complex": "Supplement",
  "vitamin d3": "Supplement",
  "zinc sulfate": "Supplement",
  "zincovit": "Supplement",
};

const STOPWORDS = new Set([
  "tab",
  "tabs",
  "tablet",
  "tablets",
  "cap",
  "caps",
  "capsule",
  "capsules",
  "inj",
  "injection",
  "syr",
  "syp",
  "susp",
  "cream",
  "oint",
  "ointment",
  "drop",
  "drops",
  "od",
  "bd",
  "bid",
  "tid",
  "qid",
  "sos",
  "stat",
  "hs",
  "ac",
  "pc",
  "po",
  "im",
  "iv",
  "oral",
  "mg",
  "mcg",
  "ml",
  "gm",
]);

const POWER_DICTIONARY: DrugEntry[] = GENERIC_DRUGS.map((generic) => ({
  generic,
  brands: BRAND_MAP[generic] ?? [],
  category: CATEGORY_MAP[generic] ?? "General Medicine",
}));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDrugText(value: string): string {
  return value
    .toLowerCase()
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|gm|ml|iu)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeDrugText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !STOPWORDS.has(token));
}

function buildInputVariants(value: string): string[] {
  const tokens = tokenize(value);
  if (tokens.length === 0) return [];

  const variants = new Set<string>();
  variants.add(tokens.join(" "));
  variants.add(tokens.join(""));

  const maxN = Math.min(3, tokens.length);
  for (let n = 1; n <= maxN; n += 1) {
    for (let i = 0; i <= tokens.length - n; i += 1) {
      variants.add(tokens.slice(i, i + n).join(" "));
    }
  }

  return Array.from(variants).filter((variant) => variant.length >= 2);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function editSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 0 : Math.max(0, 1 - distance / maxLength);
}

function tokenJaccard(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function soundex(value: string): string {
  const letters = normalizeDrugText(value).replace(/[^a-z]/g, "");
  if (!letters) return "";

  const map: Record<string, string> = {
    b: "1", f: "1", p: "1", v: "1",
    c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
    d: "3", t: "3",
    l: "4",
    m: "5", n: "5",
    r: "6",
  };

  const first = letters[0].toUpperCase();
  let result = first;
  let previous = map[letters[0]] ?? "";

  for (let i = 1; i < letters.length && result.length < 4; i += 1) {
    const char = letters[i];
    const code = map[char] ?? "";
    if (code && code !== previous) {
      result += code;
    }
    previous = code;
  }

  return (result + "000").slice(0, 4);
}

function similarityScore(input: string, candidate: string): number {
  const cleanInput = normalizeDrugText(input);
  const cleanCandidate = normalizeDrugText(candidate);
  if (!cleanInput || !cleanCandidate) return 0;

  const spacedEdit = editSimilarity(cleanInput, cleanCandidate);
  const compactEdit = editSimilarity(cleanInput.replace(/\s+/g, ""), cleanCandidate.replace(/\s+/g, ""));
  const jaccard = tokenJaccard(cleanInput, cleanCandidate);

  const includesBonus =
    cleanInput.includes(cleanCandidate) || cleanCandidate.includes(cleanInput) ? 0.12 : 0;

  const phoneticBonus =
    soundex(cleanInput) && soundex(cleanInput) === soundex(cleanCandidate) ? 0.14 : 0;

  const blended = spacedEdit * 0.62 + compactEdit * 0.18 + jaccard * 0.2 + includesBonus + phoneticBonus;
  return clamp(blended, 0, 1);
}

export function powerMatchDrug(input: string): DrugMatch | null {
  const variants = buildInputVariants(input);
  if (variants.length === 0) return null;

  const cleanInputLength = normalizeDrugText(input).replace(/\s+/g, "").length;
  const threshold = cleanInputLength <= 4 ? 0.85 : cleanInputLength <= 8 ? 0.78 : 0.7;

  let best:
    | {
        entry: DrugEntry;
        score: number;
        matchedTerm: string;
      }
    | null = null;

  for (const entry of POWER_DICTIONARY) {
    const terms = [entry.generic, ...entry.brands];

    let entryBestScore = 0;
    let entryBestTerm = entry.generic;

    for (const term of terms) {
      for (const variant of variants) {
        const score = similarityScore(variant, term);
        if (score > entryBestScore) {
          entryBestScore = score;
          entryBestTerm = term;
        }
      }
    }

    if (!best || entryBestScore > best.score) {
      best = {
        entry,
        score: entryBestScore,
        matchedTerm: entryBestTerm,
      };
    }
  }

  if (!best || best.score < threshold) return null;

  return {
    canonicalName: best.entry.generic,
    score: best.score,
    alternatives: best.entry.brands,
    category: best.entry.category,
    matchedTerm: best.matchedTerm,
  };
}

// Backward-compatible export for existing call sites.
export function fuzzyMatchDrugName(input: string): DrugMatch | null {
  return powerMatchDrug(input);
}

export { POWER_DICTIONARY };
