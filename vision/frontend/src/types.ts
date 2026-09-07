import type { Dispatch, SetStateAction } from "react";

// React関連の型定義
export interface OutletContext {
  userId: string | null;
  setUserId: Dispatch<SetStateAction<string | null>>;
}

// メッセージ関連の型定義
export interface Message {
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  id?: string;
}

export class UserMessage implements Message {
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  id?: string;

  constructor(
    content: string,
    createdAt: Date = new Date(),
    isStreaming = false,
    id?: string
  ) {
    this.content = content;
    this.createdAt = createdAt;
    this.isStreaming = isStreaming;
    this.id = id;
  }
}

export class SystemMessage implements Message {
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  id?: string;

  constructor(
    content: string,
    createdAt: Date = new Date(),
    isStreaming = false,
    id?: string
  ) {
    this.content = content;
    this.createdAt = createdAt;
    this.isStreaming = isStreaming;
    this.id = id;
  }
}

export class SystemNotification implements Message {
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  id?: string;

  constructor(
    content: string,
    createdAt: Date = new Date(),
    isStreaming = false,
    id?: string
  ) {
    this.content = content;
    this.createdAt = createdAt;
    this.isStreaming = isStreaming;
    this.id = id;
  }
}

// 通知関連の型定義
export interface NotificationType {
  message: string;
  type: string;
  id: string;
}

export interface PreviousExtractions {
  problems: Problem[];
  solutions: Solution[];
}

// ドメインオブジェクトの型定義
// 新仕様では content、旧仕様では statement を使用しているため
// 移行期間中は両方を許容する
export interface Problem {
  _id: string;
  content?: string;
  statement?: string;
  version?: number;
  sourceType?: string;
  source?: string;
  extractedFrom?: string;
  createdAt?: string;
}

export interface Solution {
  _id: string;
  content?: string;
  statement?: string;
  version?: number;
  sourceType?: string;
  source?: string;
  extractedFrom?: string;
  createdAt?: string;
}

// 重要論点
// 新仕様では content、旧仕様では questionText を使用しているため
// 移行期間中は両方を許容する
export interface Question {
  _id: string;
  content?: string;
  questionText?: string;
  tagLine?: string;
  tags?: string[];
  createdAt?: string;
  issueCount?: number;
  solutionCount?: number;
  likeCount?: number;
  themeId?: string;
}

export interface PolicyDraft {
  _id: string;
  title: string;
  content: string;
  version?: number;
  createdAt: string;
}

export interface DigestDraft {
  _id: string;
  title: string;
  content: string;
  version?: number;
  createdAt: string;
}

export interface RelatedProblem extends Problem {
  relevanceScore: number;
}

export interface RelatedSolution extends Solution {
  relevanceScore: number;
}

export interface QuestionDetails {
  question: Question;
  relatedProblems: RelatedProblem[];
  relatedSolutions: RelatedSolution[];
}

// UI関連の型定義
export type TabType = "questions" | "problems" | "solutions" | "policies";

export interface Theme {
  _id: string;
  title: string;
  description?: string;
  slug: string;
  keyQuestionCount?: number;
  commentCount?: number;
  disableNewComment?: boolean;
}

export interface Opinion {
  id: string;
  type: "problem" | "solution";
  text: string;
  authorName: string;
  questionTagline: string;
  questionId: string;
  createdAt: string | Date;
  likeCount?: number;
  commentCount?: number;
}

export type MessageType = "user" | "system" | "system-message";

// WebSocketから送信される抽出データ
// 新旧両形式を許容
export interface ExtendedExtractionData {
  _id: string;
  content?: string;
  statement?: string;
  relevanceScore?: number;
}
