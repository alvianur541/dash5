interface TighteningTorqueRow {
  location: string;
  boltDiameter: string;
  quantity: string;
  wrenchSize: string;
  torque: string;
  kgfM: string;
  lbfFt: string;
}

const ROW_RE = /(?:^|\s)(\d{1,2})\s*\|\s*([^|]{3,100}?)\s*\|\s*(?:ZW\d+\s*\|\s*)?(\d+(?:\.\d+)?)\s*\|\s*(\d+)\s*\|\s*(\d+(?:\/\d+)?)\s*\|\s*\*{0,2}(\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/g;

export const normalizeTighteningText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function tighteningTorqueRows(content: string): TighteningTorqueRow[] {
  return [...content.matchAll(ROW_RE)].map(match => ({
    location: match[2].trim(),
    boltDiameter: match[3],
    quantity: match[4],
    wrenchSize: match[5],
    torque: match[6],
    kgfM: match[7],
    lbfFt: match[8],
  }));
}
