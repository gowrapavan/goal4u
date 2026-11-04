export interface Team {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string;
  area?: { name: string; flag: string | null };
  founded?: number | null;
  clubColors?: string | null;
  venue?: string | null;
  website?: string | null;
  runningCompetitions?: { id: number; name: string; code: string; emblem: string }[];
  coach?: { name: string | null; nationality: string | null };
  squad?: Player[];
  lastUpdated?: string;
  top_scorers?: { player_name: string; goals: number; assists: number | null }[];
}

export interface Player {
  id: number;
  name: string;
  position: string;
  dateOfBirth: string;
  nationality: string;
}

export interface TMTrophy {
  name: string;
  safe_name: string;
  count: string;
  local_path: string;
  source_url: string | null;
}

export interface TMPlayer {
  player_id: number | string;
  name: string;
  tm_url: string;
  image_path: string | null;
  details: {
    market_value?: string;
    mv_last_update?: string;
    shirt_number?: string;
    is_captain?: boolean;
    achievements?: { trophy: string; count: string; img_url: string }[];
    date_of_birth?: string;
    place_of_birth?: string;
    height?: string;
    citizenship?: string[];
    foot?: string;
    current_club_name?: string;
    current_club_url?: string;
    joined?: string;
    contract_expires?: string;
    player_agent?: string;
    outfitter?: string;
    social_media?: string[];
    national_caps?: string;
    national_goals?: string;
    national_team_name?: string;
    national_team_url?: string;
    position?: string;
    other_positions?: string[];
    youth_clubs?: string;
    further_information?: string;
  };
  trophies: TMTrophy[];
}

export interface TMTeamMetadata {
  team_id: number | string;
  name?: string;
  tm_name?: string;
  tm_url: string;
  tm_stats: {
    squad_size?: string;
    average_age?: string;
    foreigners?: string;
    national_team?: string;
    league_level?: string;
    stadium?: string;
    coach?: string;
    total_market_value?: string;
  };
  trophies: TMTrophy[];
}

export interface TMSquadPlayer {
  player_id: string | number;
  name: string;
  position: string;
}

export interface TMSquad {
  team_id: string | number;
  season: string;
  competition?: string;
  squad_roster: TMSquadPlayer[];
}

export interface TMScorer {
  rank?: number;
  player_name: string;
  player_id: number | string | null;
  tm_player_id: string;
  goals: string | number;
  club_name?: string;
  club_url?: string;
  team_id?: number | string | null;
  tm_team_id?: string;
  nationality?: string;
  season?: string;
  position?: string;
}

export interface TMMarketValuePlayer {
  rank: number;
  player_name: string;
  player_id: number | string | null;
  tm_player_id: string;
  market_value: string;
  club_name: string;
  club_url: string;
  team_id: number | string | null;
  tm_team_id: string;
  nationality: string;
  age: string;
  position: string;
}

export interface Competition {
  code: string;
  slug: string;
  name: string;
  country: string;
  area?: string | { name: string; flag: string | null };
  emblem: string;
  currentSeason?: {
    startDate: string;
    endDate: string;
    currentMatchday: number | null;
  };
}

export interface MatchScore {
  home: number | null;
  away: number | null;
}

export interface Match {
  GameId: number;
  CompetitionCode?: string;
  RoundId: number;
  RoundName: string;
  Date: string;
  DateTime: string;
  Status: "Final" | "Scheduled" | string;
  Week?: any;
  VenueType?: string;
  HomeTeamId: number;
  AwayTeamId: number;
  HomeTeamKey: string;
  AwayTeamKey: string;
  HomeTeamName: string;
  AwayTeamName: string;
  HomeTeamLogo: string | null;
  AwayTeamLogo: string | null;
  HomeTeamRank?: number | null;
  AwayTeamRank?: number | null;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  Score?: {
    duration: string;
    fullTime: MatchScore;
    halfTime: MatchScore;
    regularTime: MatchScore;
    extraTime: MatchScore;
    penalties: MatchScore;
  };
  Result?: number | null;
  SeasonSlug?: string;
  Points?: Record<string, any> | null;
  Goals?: any[];
  Lineups?: {
    home?: { lineup?: any[]; bench?: any[]; formation?: string };
    away?: { lineup?: any[]; bench?: any[]; formation?: string };
  };
}

export interface Short {
  video_id?: string;
  videoId?: string;
  title: string;
  thumbnail?: string;
  channel_id?: string;
  channel_title?: string;
  channelName?: string;
  duration: string;
  view_count?: string;
  viewCount?: number | string;
  like_count?: string;
  likeCount?: number | string;
  published_at?: string;
  publishedAt?: string;
  description?: string;
  tags?: string[];
}

export interface LiveStream {
  match: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  kickoffIST: string;
  league: string;
  embedUrl: string;
  source: string;
  label: string;
  serverLabel?: string;
}

