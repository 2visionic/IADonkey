export type FeedbackType = 'bug' | 'idea' | 'other';
export type FeedbackStatus = 'new' | 'in_progress' | 'postponed' | 'resolved';
export type FeedbackPriority = 'low' | 'normal' | 'high' | 'critical';

export interface FeedbackItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  authorHost?: string;
  type: FeedbackType;
  title: string;
  description: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  appVersion: string;
  osVersion?: string;
  hasScreenshot?: boolean;
  screenshotFilename?: string;
  targetVersion?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  devNote?: string;
}

export interface FeedbackSettings {
  sharedFolder?: string;
  authorName?: string;
}
