import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateDynamicTimeChange(deltaY: number, originalMins: number = 0): number {
  const absY = Math.abs(deltaY);
  const sign = Math.sign(deltaY);

  let rawMins = 0;
  let step = 1;

  if (absY < 40) {
    // Zona de precisão mais curta (1 em 1 minuto)
    rawMins = absY / 2.5;
    step = 1;
  } else if (absY < 120) {
    // Marcha 2 (incrementos de 5 minutos)
    rawMins = 16 + ((absY - 40) * 0.4);
    step = 5;
  } else if (absY < 250) {
    // Marcha 3 (incrementos de 10 minutos)
    rawMins = 48 + ((absY - 120) * 0.8);
    step = 10;
  } else {
    // Velocidade altíssima (incrementos de 30 minutos)
    rawMins = 152 + ((absY - 250) * 1.5);
    step = 30;
  }

  const change = Math.round(rawMins / step) * step * sign;
  let totalMins = originalMins + change;

  // Micro imã para 5 e 0
  const rem = totalMins % 5;
  if (rem === 1) totalMins -= 1;
  else if (rem === 4) totalMins += 1;
  else if (rem === -1) totalMins += 1;
  else if (rem === -4) totalMins -= 1;

  return totalMins - originalMins;
}
