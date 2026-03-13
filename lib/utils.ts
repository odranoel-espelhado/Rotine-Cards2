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

export function matchesRepeatPattern(r: any, checkDateStr: string): boolean {
    const baseDate = r.targetDate || r.date;
    if (!baseDate) return false;

    // Se possui exceções (Blocos), um dia na lista de exceções nunca "matcha"
    if (r.exceptions && Array.isArray(r.exceptions) && r.exceptions.includes(checkDateStr)) {
        return false;
    }

    if (!r.repeatPattern || r.repeatPattern === 'none') {
        return baseDate === checkDateStr;
    }
    if (checkDateStr < baseDate) return false;

    const targetObj = new Date(baseDate + "T12:00:00");
    const checkObj = new Date(checkDateStr + "T12:00:00");

    if (r.repeatPattern === 'daily') return true;
    if (r.repeatPattern === 'weekly' && targetObj.getDay() === checkObj.getDay()) return true;
    if (r.repeatPattern === 'monthly' && targetObj.getDate() === checkObj.getDate()) return true;
    if (r.repeatPattern === 'yearly' && targetObj.getDate() === checkObj.getDate() && targetObj.getMonth() === checkObj.getMonth()) return true;
    
    // Suporte Legado do Bloco
    if (r.repeatPattern === 'weekdays') {
        const d = checkObj.getDay();
        if (d !== 0 && d !== 6) return true;
    }

    if ((r.repeatPattern === 'workdays' || r.repeatPattern === 'custom') && Array.isArray(r.weekdays) && r.weekdays.includes(checkObj.getDay())) return true;
    if (r.repeatPattern === 'monthly_on') {
        if (Array.isArray(r.monthlyDays) && r.monthlyDays.length > 0 && r.monthlyDays.includes(checkObj.getDate())) return true;
        if (r.monthlyNth && typeof r.monthlyNth === 'object' && !Array.isArray(r.monthlyNth)) {
            const mnth = r.monthlyNth as any;
            if (mnth.weekday === checkObj.getDay()) {
                const chkDay = checkObj.getDate();
                const nth = Math.ceil(chkDay / 7);
                if (mnth.nth === nth) return true;
                if (mnth.nth === -1 && chkDay + 7 > new Date(checkObj.getFullYear(), checkObj.getMonth() + 1, 0).getDate()) return true;
            }
        }
    }
    
    if (r.repeatPattern === 'interval') {
        const val = r.repeatIntervalValue || 2;
        const unit = r.repeatIntervalUnit || 'days';
        const diffTime = checkObj.getTime() - targetObj.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (unit === 'days') {
            if (diffDays % val === 0) return true;
        } else if (unit === 'weeks') {
            if (diffDays % 7 === 0) {
                const diffWeeks = diffDays / 7;
                if (diffWeeks % val === 0) return true;
            }
        } else if (unit === 'months') {
            if (targetObj.getDate() === checkObj.getDate()) {
                const diffMonths = (checkObj.getFullYear() - targetObj.getFullYear()) * 12 + (checkObj.getMonth() - targetObj.getMonth());
                if (diffMonths % val === 0) return true;
            }
        }
    }

    return false;
}
