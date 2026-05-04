
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
  couponApplied?: boolean;
  isManualCheck?: boolean;
  reservationComplete?: boolean;
  textColor?: string;
  rowBgColor?: string;
  cellColors?: Record<string, string>;
  bottomBorder?: boolean;
  createdAt?: number;
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

export type AdminTab = 'dashboard' | 'manual' | 'deposit' | 'reviewComplete' | 'productPrices' | 'sales';

export interface SalesDailyEntry {
  id: string;
  date: string;
  product: string;
  productDetail: string;
  quantity: number;
  sellingPrice: number;
  supplyPrice: number;
  marginPerUnit: number;
  totalMargin: number;
  adCost: number;
  housePurchase: number;
  solution: number;
  refund: number;
  hpManual?: boolean;
}
export type CustomerView = 'landing' | 'apply' | 'review';

export interface HpFormula {
  baseFee: number;        // 기본 수수료 (빈박, 기본값: 1000)
  supplyPriceRate: number; // 빈박 판매가 비율 (기본값: 0.12 = 12%)
  extraFee: number;       // 기타 비용 (빈박, 기본값: 2300)
  silbaeAddSupply: boolean; // 실배 공식 사용 여부 (기본값: true)
  silbaeRate: number;     // 실배 판매가 비율 (기본값: 0.12 = 12%)
}

export interface AppSettings {
  isApplyActive: boolean;
  globalReviewGuide?: string;
  hpFormula?: HpFormula;
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

export type SalesSubTab = 'summary' | 'profitLoss' | 'salesDetail';

export interface ProductPrice {
  id: string;
  name: string;
  price: number;
  priceNoCoupon?: number;
  supplyPrice?: number;
  sellingPrice?: number;
  sellingPriceNoCoupon?: number;
  margin?: number;
}

export interface BusinessInfo {
  id: string;
  name: string;
  phone: string;
  address: string;
  accountInfo: string;
  collectionPrefix: string;
}

export type ExportFieldSource =
  | 'orderNumber' | 'name1' | 'name2' | 'ordererName' | 'address'
  | 'emergencyContact' | 'product' | 'memo' | 'trackingNumber' | 'accountNumber'
  | 'paymentAmount' | 'count' | 'date'
  | 'bizName' | 'bizPhone' | 'bizAddress'
  | 'fixed' | 'empty' | 'masterCol';

export interface ExportColumn {
  header: string;
  source: ExportFieldSource;
  fixedValue?: string;
  stripDash?: boolean;
  masterColName?: string;
}

export interface PlatformConfig {
  id: string;
  name: string;
  headerRow: number;
  orderNumColName: string;
  fieldMapping?: Record<string, string>;
  sampleColumns?: string[];
}

export interface ExportTemplate {
  id: string;
  name: string;
  sheetName: string;
  filePrefix: string;
  columns: ExportColumn[];
  color: string;
}
