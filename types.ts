
export interface Product {
  id: string;
  name: string;
  guideText: string;
  reviewGuideText: string;
  refundAmount: number;
  totalQuota: number;
  remainingQuota: number;
  thumbnail?: string;
}

export interface Submission {
  id: string;
  productId?: string;
  productName?: string;
  date: string;
  kakaoNick: string;
  phoneNumber: string;
  ordererName: string;
  orderNumber: string;
  address: string;
  refundAmount: number;
  bankInfo: string;
  proofImage?: string;
  reviewProofImage?: string;
  type: 'purchase' | 'review';
}

export interface ManualEntry {
  id: string;
  proofImage: string;
  count: number;
  product: string;
  date: string;
  name1: string;
  name2: string;
  ordererName: string;
  orderNumber: string;
  address: string;
  memo: string;
  paymentAmount: number;
  emergencyContact: string;
  accountNumber: string;
  trackingNumber: string;
  beforeDeposit: boolean;
  afterDeposit: boolean;
  depositDate?: string;
  isManualCheck?: boolean;
  reservationComplete?: boolean;
}

export type AppMode = 'customer' | 'admin';
export interface ReviewEntry {
  id: string;
  image: string;
  orderNumber: string;
  ordererName: string;
  bankInfo: string;
  date: string;
}

export type AdminTab = 'dashboard' | 'manual' | 'deposit' | 'reviewComplete' | 'productPrices';
export type CustomerView = 'landing' | 'apply' | 'review';

export interface AppSettings {
  isApplyActive: boolean;
  globalReviewGuide?: string;
}

// Added MissionStatus, Mission, and UserSubmission to fix missing export errors in components/
export enum MissionStatus {
  NOT_STARTED = 'NOT_STARTED',
  PURCHASE_PENDING = 'PURCHASE_PENDING',
  PURCHASE_VERIFIED = 'PURCHASE_VERIFIED',
  REVIEW_PENDING = 'REVIEW_PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export interface Mission {
  id: string;
  title: string;
  thumbnail: string;
  rewardAmount: number;
  description: string;
  guideUrl: string;
  steps?: string[];
}

export interface UserSubmission {
  missionId: string;
  status: MissionStatus;
  submittedAt: number;
  lastUpdatedAt: number;
  userName?: string;
  bankName?: string;
  accountNumber?: string;
  purchaseProofImage?: string;
  reviewProofImage?: string;
}

export interface ProductPrice {
  id: string;
  name: string;
  price: number;
  supplyPrice?: number;
  sellingPrice?: number;
  margin?: number;
}
