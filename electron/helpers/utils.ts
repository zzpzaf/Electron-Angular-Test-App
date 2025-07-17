import { existsSync, mkdirSync } from "fs";

export function ensureFolderExists(folderPath: string): void {
  if (!existsSync(folderPath)) {
    try {
      mkdirSync(folderPath, { recursive: true });
      console.log(`📂 Created output folder: ${folderPath}`);
    } catch (err) {
      console.error(`❌ Failed to create folder "${folderPath}":`, err);
      throw err;
    }
  }
}

export function formatDate(input: string): string {

  console.log(`formatDate(${input})`);

  const now = new Date();
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  if (/^\d+h ago$/.test(input)) {
    return `${String(now.getFullYear()).slice(2)}${pad(
      now.getMonth() + 1
    )}${pad(now.getDate())}`;
  }



  if (/^\d+\s*(h|hours)\s+ago$/.test(input)) {
    const hoursAgo = parseInt(input);
    const pastDate = new Date(now);
    pastDate.setHours(now.getHours() - hoursAgo);
    return `${String(pastDate.getFullYear()).slice(2)}${pad(
      pastDate.getMonth() + 1
    )}${pad(pastDate.getDate())}`;
  }

  // if (/^\d+d ago$/.test(input)) {
  if (/^\d+\s*(d|days)\s+ago$/.test(input)) {
    const daysAgo = parseInt(input);
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - daysAgo);
    return `${String(pastDate.getFullYear()).slice(2)}${pad(
      pastDate.getMonth() + 1
    )}${pad(pastDate.getDate())}`;
  }

  if (/^[A-Z][a-z]{2} \d{1,2}$/.test(input)) {
    const [monthStr, day] = input.split(" ");
    return `${String(now.getFullYear()).slice(2)}${pad(
      months[monthStr] + 1
    )}${pad(parseInt(day, 10))}`;
  }

  if (/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(input)) {
    const [monthStr, dayWithComma, year] = input.split(" ");
    const day = dayWithComma.replace(",", "");
    return `${year.slice(2)}${pad(months[monthStr] + 1)}${pad(
      parseInt(day, 10)
    )}`;
  }

  return "Unknown";
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
