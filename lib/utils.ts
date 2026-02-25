import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateDynamicTimeChange(deltaY: number, originalMins: number = 0): number {
  const absY = Math.abs(deltaY);
  const sign = Math.sign(deltaY);

  let change = 0;

  if (absY <= 20) {
    // Marcha 1: 0~20px (1 min a cada 2px)
    change = Math.floor(absY / 2) * 1;
  } else if (absY <= 60) {
    // Marcha 2: 20~60px (5 min a cada 8px)
    const base = 10; // (20 / 2) * 1
    const delta = absY - 20;
    change = base + Math.floor(delta / 8) * 5;
  } else if (absY <= 100) {
    // Marcha 3: 60~100px (10 min a cada 10px)
    const base = 35; // 10 + (40 / 8) * 5
    const delta = absY - 60;
    change = base + Math.floor(delta / 10) * 10;
  } else {
    // Marcha 4: +100px (30 min a cada 15px)
    const base = 75; // 35 + (40 / 10) * 10
    const delta = absY - 100;
    change = base + Math.floor(delta / 15) * 30;
  }

  change = change * sign;
  let totalMins = originalMins + change;

  // Micro imã para 5 e 0
  const rem = totalMins % 5;
  if (rem === 1) totalMins -= 1;
  else if (rem === 4) totalMins += 1;
  else if (rem === -1) totalMins += 1;
  else if (rem === -4) totalMins -= 1;

  return totalMins - originalMins;
}
