// Shapes of the Go server's /api/lort responses (server/internal/requests, team, api).
import type { Status } from '@/components/lort';

export type { Status };

export interface Ref {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  name: string;
  avatar: string;
  team: boolean;
}

export interface Item {
  id: string;
  title: string;
  body: string;
  status: Status;
  board: Ref;
  author: Person;
  tags: Ref[];
  comments: number;
  votes: number;
  voted: boolean;
  visible: boolean;
  awaitingApproval: boolean;
  new: boolean;
  created: string;
}

export interface Page {
  items: Item[];
  page: number;
  perPage: number;
  totalItems: number;
}

export interface Activity {
  id: string;
  kind: 'created' | 'status_changed' | 'merged_in' | 'merged_from' | 'board_changed';
  actor: Person;
  from: string;
  to: string;
  created: string;
}

export interface Comment {
  id: string;
  body: string;
  images: string[];
  internal: boolean;
  author: Person;
  created: string;
  replies: Comment[];
}

export interface Detail extends Item {
  images: string[];
  mergedInto: Ref | null;
  activity: Activity[];
  /** Top-level comments with their replies. (Item.comments is the count.) */
  thread: Comment[];
}

export interface Change {
  from: Status;
  to: Status;
  roadmap: 'added' | 'removed' | '';
}

export interface Stats {
  total: number;
  waiting: number;
  new: number;
}

export interface Brand {
  appName: string;
  logo: string;
  primaryColor: string;
  showLandingCard: boolean;
  roadmapPublic: boolean;
  features: { email: boolean; voice: boolean; turnstile: boolean };
}

export interface Config extends Brand {
  boards: Ref[];
  tags: Ref[];
}

export interface Member {
  id: string;
  email: string;
  name: string;
  created: string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  joined: string;
  requests: number;
  votes: number;
  verified: boolean;
  banned: boolean;
  team: boolean;
}
