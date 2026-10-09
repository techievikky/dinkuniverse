// Tournament planning constants shared between the builder UI and the list display.

export const FORMATS = [
  { value: "single_elimination", label: "Single Elimination" },
  { value: "double_elimination", label: "Double Elimination" },
  { value: "round_robin", label: "Round Robin" },
  { value: "pool_play", label: "Pool Play → Bracket" },
];

export const CATEGORIES = [
  { value: "singles", label: "Singles" },
  { value: "mens_doubles", label: "Men's Doubles" },
  { value: "womens_doubles", label: "Women's Doubles" },
  { value: "mixed_doubles", label: "Mixed Doubles" },
];

export const BRACKETS = [
  { value: "under_2.5", label: "2.5 & Under", min: 0, max: 2.5 },
  { value: "2.5-3.0", label: "2.5 – 3.0", min: 2.5, max: 3.0 },
  { value: "3.0-3.5", label: "3.0 – 3.5", min: 3.0, max: 3.5 },
  { value: "3.5-4.0", label: "3.5 – 4.0", min: 3.5, max: 4.0 },
  { value: "4.0-4.5", label: "4.0 – 4.5", min: 4.0, max: 4.5 },
  { value: "4.5-5.0", label: "4.5 – 5.0", min: 4.5, max: 5.0 },
  { value: "over_5.0", label: "5.0+", min: 5.0, max: 8.0 },
  { value: "open", label: "Open (all ratings)", min: 0, max: 8.0 },
];

// Resolve the bracket key for a stored { min, max } pair, falling back to "open".
export const bracketFor = (division) =>
  BRACKETS.find((b) => b.min === division.dupr_min && b.max === division.dupr_max)?.value || "open";

export const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || value;
export const formatLabel = (value) => FORMATS.find((f) => f.value === value)?.label || value;