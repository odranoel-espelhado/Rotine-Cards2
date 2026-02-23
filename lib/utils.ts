import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateDynamicTimeChange(deltaY: number): number {
  const absY = Math.abs(deltaY);
  const sign = Math.sign(deltaY);

  let rawMins = 0;
  let step = 1;

  if (absY < 50) {
    // Zona de precisão (1 em 1 minuto)
    rawMins = absY / 2; // ex: 40px -> 20 min
    step = 1;
  } else if (absY < 150) {
    // Aceleração média (incrementos de 15 minutos)
    rawMins = 25 + ((absY - 50) * 1.5);
    step = 15;
  } else if (absY < 250) {
    // Aceleração rápida (incrementos de 30 minutos)
    rawMins = 175 + ((absY - 150) * 3);
    step = 30;
  } else {
    // Velocidade altíssima (incrementos de 60 minutos)
    rawMins = 475 + ((absY - 250) * 6);
    step = 60;
  }

  const minutes = Math.round(rawMins / step) * step;
  return sign * minutes;
}

