import { format, differenceInDays } from 'date-fns';

export function formatNumber(numStr: string | number): string {
  const num = typeof numStr === 'string' ? parseInt(numStr, 10) : numStr;
  if (isNaN(num)) return "0";
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

export function parseDuration(duration: string | undefined): string {
  if (!duration) return "0:00";
  // ISO 8601 duration parser for shorts: PT0M58S -> "0:58"
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTimeIST(utcDateStr: string): string {
  try {
    const date = new Date(utcDateStr);
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).format(date);
  } catch {
    return "";
  }
}

export function formatDateTimeIST(utcDateStr: string): string {
  try {
    const date = new Date(utcDateStr);
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).format(date);
  } catch {
    return "";
  }
}

export function toISTDateLabel(dateTimeUTC: string): string {
  try {
    return new Date(dateTimeUTC).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  } catch {
     return "";
  }
}

export function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function slugify(text: string): string {
  if (!text) return '';
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function getYoutubeFallback(id: string, size: 'hq' | 'mq' = 'hq'): string {
  return `https://img.youtube.com/vi/${id}/${size}default.jpg`;
}

export function getCrest(teamId: number | string | undefined, logoUrl: string | null | undefined): string {
  if (logoUrl && !logoUrl.includes('tmssl.akamaized.net')) return logoUrl;
  return `/api/data/ext/c/${teamId}.png`;
}

export function getDerivedMatchStatus(utcDateStr: string | undefined, originalStatus: string | undefined) {
  const statusRaw = originalStatus === 'FINISHED' ? 'Final' : (originalStatus || 'Unknown');
  
  let isLive = ['IN_PLAY', 'PAUSED', 'Live'].includes(statusRaw);
  let isFinished = ['Final', 'Full Time', 'FT'].includes(statusRaw);
  let isScheduled = statusRaw === 'Scheduled';
  let displayStatus = statusRaw;

  if (utcDateStr) {
    const matchTime = new Date(utcDateStr).getTime();
    const now = new Date().getTime(); // Uses current system time
    const diffMs = now - matchTime;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours >= 0 && diffHours < 3 && !isFinished) {
       // Within 3 hours and not explicitly finished by db -> Live
       isLive = true;
       isScheduled = false;
       isFinished = false;
       displayStatus = "Live";
    } else if (diffHours >= 3 || (isFinished && diffHours >= 0)) {
       // Past 3 hours -> Finished
       isLive = false;
       isScheduled = false;
       isFinished = true;
       displayStatus = "FT";
    } else if (diffHours < 0) {
       // In the future
       isScheduled = true;
       isLive = false;
       isFinished = false;
    }
  }

  if (isFinished && displayStatus === "Final") displayStatus = "FT";
  if (isScheduled && displayStatus === "Unknown") displayStatus = "Scheduled";

  return { displayStatus, isLive, isFinished, isScheduled };
}

export function getRelativeTime(utcDateStr: string): string {
  try {
    if (!utcDateStr) return "";
    const date = new Date(utcDateStr);
    if (isNaN(date.getTime())) return "";
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMins / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffMins < 60) return `${Math.max(0, diffMins)} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return `Yesterday`;
    return `${diffDays} days ago`;
  } catch {
    return "";
  }
}

export function safeFormatDate(dateStr: string | undefined, formatStr: string, fallback: string = ""): string {
  if (!dateStr) return fallback;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}

export function convertINRtoEUR(valStr: string | number | undefined): string {
  if (!valStr) return '€0';
  const str = String(valStr).trim();
  
  if (str.startsWith('€')) return str;
  
  // Extract number and handle units
  const numericMatch = str.replace(/,/g, '').match(/[\d.]+/);
  if (!numericMatch) return str;
  
  let num = parseFloat(numericMatch[0]);
  const isCr = str.toLowerCase().includes('cr');
  const isLakh = str.toLowerCase().includes('lakh');
  const isM = str.toLowerCase().includes('m') && !isCr && !isLakh;
  const isBn = str.toLowerCase().includes('bn') && !isCr && !isLakh;

  let inrValue = num;
  if (isCr) inrValue = num * 10000000;
  else if (isLakh) inrValue = num * 100000;
  else if (isM) inrValue = num * 1000000;
  else if (isBn) inrValue = num * 1000000000;

  // Conversion: 1 EUR = 90 INR
  const eurValue = inrValue / 90;

  if (eurValue >= 1000000000) {
    return `€${(eurValue / 1000000000).toFixed(2)}B`;
  } else if (eurValue >= 1000000) {
    return `€${(eurValue / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  } else if (eurValue >= 1000) {
    return `€${(eurValue / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  } else {
    return `€${Math.round(eurValue)}`;
  }
}

export function getCurrentSeason(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed: 6 is July
  // If July or later, it's the start of the next season cycle (e.g. 2026/27)
  return (currentMonth >= 6) ? currentYear.toString() : (currentYear - 1).toString();
}

export function getCurrentSeasonLabel(): string {
  const s = getCurrentSeason();
  const next = (parseInt(s) + 1).toString();
  return `${s}-${next}`;
}

export function getCurrentTournamentYear(code: 'WC' | 'EC' | 'EURO'): string {
  const now = new Date();
  const year = now.getFullYear();
  const anchor = (code === 'WC') ? 2026 : 2024;
  const offset = year - anchor;
  const cycles = Math.round(offset / 4);
  return (anchor + cycles * 4).toString();
}

import { imageUrl } from './data-origin';

/** Used when a player has no photo of his own. '' when no data service is configured (the page then shows initials). */
export const PLAYER_FALLBACK_IMAGE = imageUrl('/assets/player_images/default.jpg');

/** Player photo files in the data service, best first: public/headshot/{id}.png, then public/assets/player_images/{id}.jpg (or the page's own image_path). Every URL carries the token. */
export function playerImageSources(playerId: number | string | null | undefined, imagePath?: string | null): string[] {
  const out: string[] = [];
  if (playerId) out.push(imageUrl(`/headshot/${playerId}.png`));
  if (imagePath) out.push(imageUrl(imagePath));
  if (playerId) out.push(imageUrl(`/assets/player_images/${playerId}.jpg`));
  return [...new Set(out.filter(Boolean))];
}

export function getPlayerImage(playerId: number | string, imagePath?: string): string {
  if (imagePath) return imageUrl(imagePath);
  if (!playerId) return PLAYER_FALLBACK_IMAGE;
  return imageUrl(`/assets/player_images/${playerId}.jpg`);
}

export function getAge(dateOfBirth: string | undefined): string {
  if (!dateOfBirth) return '—';
  try {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return '—';
    const diff = Date.now() - dob.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970).toString();
  } catch {
    return '—';
  }
}

export function normalizeString(str: string): string {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function normalizeTeamName(name: string): string {
  if (!name) return '';
  const lower = name.toLowerCase().trim();
  
  const map: Record<string, string> = {
    "holland": "netherlands",
    "هولندا": "netherlands",
    "cote d'ivoire": "ivory coast",
    "côte d'ivoire": "ivory coast",
    "türkiye": "turkey",
    "korea republic": "south korea",
    "korea dpr": "north korea",
    "usa": "united states",
    "ksa": "saudi arabia",
    "eng": "england",
    "السويد": "sweden",
    "ألمانيا": "germany",
    "كوت ديفوار": "ivory coast",
    "اسكتلندا": "scotland",
    "المغرب": "morocco",
    "البرازيل": "brazil",
    "هايتي": "haiti",
    "تركيا": "turkey",
    "باراغواي": "paraguay",
    "egypt": "egypt"
  };

  return map[lower] || lower;
}

export function getMatchDisplayScore(match: any) {
  const score = match.Score || match.score;
  const duration = score?.duration || "REGULAR";
  
  let home = match.HomeTeamScore ?? score?.fullTime?.home ?? 0;
  let away = match.AwayTeamScore ?? score?.fullTime?.away ?? 0;
  let homePenalties = "";
  let awayPenalties = "";
  let penalties = "";
  let homePenaltiesRaw: number | null = null;
  let awayPenaltiesRaw: number | null = null;

  if (duration === "PENALTY_SHOOTOUT" && score) {
    const hReg = score.regularTime?.home;
    const hExt = score.extraTime?.home ?? 0;
    const aReg = score.regularTime?.away;
    const aExt = score.extraTime?.away ?? 0;
    
    if (hReg !== null && hReg !== undefined) {
      home = Number(hReg) + Number(hExt);
    } else if (score.fullTime?.home !== null && score.fullTime?.home !== undefined) {
      // If we have penalties, fullTime might include them. 
      // If it's a penalty shootout, the score after 120m is what we want as "home"
      if (score.penalties?.home !== null && score.penalties?.home !== undefined) {
        home = Number(score.fullTime.home) - Number(score.penalties.home);
      } else {
        home = score.fullTime.home;
      }
    }

    if (aReg !== null && aReg !== undefined) {
      away = Number(aReg) + Number(aExt);
    } else if (score.fullTime?.away !== null && score.fullTime?.away !== undefined) {
      if (score.penalties?.away !== null && score.penalties?.away !== undefined) {
        away = Number(score.fullTime.away) - Number(score.penalties.away);
      } else {
        away = score.fullTime.away;
      }
    }
    
    if (score.penalties?.home !== undefined && score.penalties?.home !== null) {
      homePenaltiesRaw = score.penalties.home;
      awayPenaltiesRaw = score.penalties.away;
      homePenalties = `(${score.penalties.home})`;
      awayPenalties = `(${score.penalties.away})`;
      penalties = `(${score.penalties.home}-${score.penalties.away})`;
    }
  }

  return { home, away, penalties, homePenalties, awayPenalties, homePenaltiesRaw, awayPenaltiesRaw };
}

