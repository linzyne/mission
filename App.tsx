import React, { useState, useEffect, useRef } from 'react';
import { Product, Submission, AppMode, CustomerView, AppSettings, HpFormula, AdminTab, ManualEntry, ReviewEntry, ProductPrice, SalesDailyEntry, SalesSubTab, BusinessInfo, ExportTemplate, ExportColumn, ExportFieldSource, PlatformConfig } from './types';
import { verifyImage } from './services/geminiService';
import { db } from './services/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, query, orderBy, writeBatch, deleteField, getDocs } from 'firebase/firestore';

const BUSINESSES: Record<string, BusinessInfo> = {
  angun: {
    id: 'angun',
    name: '안군농원',
    phone: '01050447749',
    address: '인천시 연수구 송도동 214, D동 2206-1호',
    accountInfo: '국민 228 002 04 129095 김성아',
    collectionPrefix: '',
  },
  zoe: {
    id: 'zoe',
    name: '조에농원',
    phone: '01094496343',
    address: '',
    accountInfo: '',
    collectionPrefix: 'zoe_',
  },
};

function getCol(baseName: string, prefix: string): string {
  return prefix ? `${prefix}${baseName}` : baseName;
}

function normProductName(s: string | undefined | null): string {
  return (s || '').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/\s+/g, ' ');
}

function toLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FIELD_SOURCE_LABELS: Record<ExportFieldSource, string> = {
  orderNumber: '주문번호', name1: '이름1', name2: '이름2/받는사람', ordererName: '주문자명',
  address: '주소', emergencyContact: '전화번호', product: '품목', memo: '비고',
  trackingNumber: '운송장번호', accountNumber: '계좌번호', paymentAmount: '결제금액',
  count: '갯수', date: '날짜', bizName: '업체명', bizPhone: '업체전화', bizAddress: '업체주소',
  fixed: '고정값', empty: '빈칸', masterCol: '마스터시트',
};

const DEFAULT_EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: 'lotte',
    name: '롯데예약',
    sheetName: '롯데예약',
    filePrefix: '롯데예약',
    color: 'red',
    columns: [
      { header: '주문번호', source: 'orderNumber' },
      { header: '보내는사람(지정)', source: 'bizName' },
      { header: '전화번호1(지정)', source: 'bizPhone' },
      { header: '전화번호2(지정)', source: 'empty' },
      { header: '우편번호(지정)', source: 'empty' },
      { header: '주소(지정)', source: 'bizAddress' },
      { header: '받는사람', source: 'name2' },
      { header: '전화번호1', source: 'emergencyContact', stripDash: true },
      { header: '전화번호2', source: 'empty' },
      { header: '우편번호', source: 'empty' },
      { header: '주소', source: 'address' },
      { header: '상품명1', source: 'fixed', fixedValue: '완구류' },
      { header: '상품상세1', source: 'empty' },
      { header: '수량(A타입)', source: 'empty' },
      { header: '배송메시지', source: 'empty' },
      { header: '운임구분', source: 'empty' },
      { header: '운임', source: 'empty' },
      { header: '운송장번호', source: 'empty' },
    ],
  },
  {
    id: 'delivery',
    name: '택배대행',
    sheetName: '택배대행',
    filePrefix: '택배대행',
    color: 'orange',
    columns: [
      { header: '주문번호', source: 'orderNumber' },
      { header: '받는사람', source: 'name2' },
      { header: '전화번호1', source: 'emergencyContact', stripDash: true },
      { header: '전화번호2', source: 'fixed', fixedValue: '롯데택배' },
      { header: '우편번호', source: 'empty' },
      { header: '주소', source: 'address' },
      { header: '상품명1', source: 'fixed', fixedValue: '완구류' },
      { header: '상품상세1', source: 'empty' },
      { header: '수량(A타입)', source: 'empty' },
      { header: '배송메시지', source: 'empty' },
      { header: '불필요항목', source: 'empty' },
      { header: '불필요항목', source: 'empty' },
      { header: '불필요항목', source: 'empty' },
      { header: '보내는사람(지정)', source: 'fixed', fixedValue: '주노엘' },
      { header: '전화번호1(지정)', source: 'fixed', fixedValue: '01050447749' },
      { header: '송장번호', source: 'empty' },
    ],
  },
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('customer');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [customerView, setCustomerView] = useState<CustomerView>('landing');

  // Multi-tenant: 선택된 사업자
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);
  const bizInfo = selectedBiz ? BUSINESSES[selectedBiz] : null;
  const colPrefix = bizInfo?.collectionPrefix ?? '';

  // proofImage는 localStorage에만 저장 (Firestore 데이터 전송 비용 절감)
  const proofKey = (id: string) => `proof_${colPrefix || 'angun'}_${id}`;
  const loadProofImage = (id: string): string => { try { return localStorage.getItem(proofKey(id)) || ''; } catch { return ''; } };
  const saveProofImage = (id: string, base64: string) => {
    try {
      if (base64) localStorage.setItem(proofKey(id), base64);
      else localStorage.removeItem(proofKey(id));
    } catch { /* localStorage 용량 초과 시 무시 */ }
  };
  const applyProofToEntries = (entries: ManualEntry[]): ManualEntry[] =>
    entries.map(e => ({ ...e, proofImage: loadProofImage(e.id) }));
  const updateProofInState = (id: string, base64: string) => {
    saveProofImage(id, base64);
    setManualEntries(prev => prev.map(e => e.id === id ? { ...e, proofImage: base64 } : e));
  };

  // URL 파라미터로 사업자 자동 선택 (?biz=angun 또는 ?biz=zoe), 없으면 기본값 angun
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bizParam = params.get('biz');
    setSelectedBiz(bizParam && BUSINESSES[bizParam] ? bizParam : 'angun');
  }, []);

  const [adminPassword, setAdminPassword] = useState('1234');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);


  // Firestore Sync: Settings
  const [settings, setSettings] = useState<AppSettings>({ isApplyActive: true });

  useEffect(() => {
    if (!selectedBiz) { setSettings({ isApplyActive: true }); return; }
    const unsub = onSnapshot(doc(db, getCol('settings', colPrefix), 'global'), (d) => {
      if (d.exists()) setSettings(d.data() as AppSettings);
      else setSettings({ isApplyActive: true });
    });
    return () => unsub();
  }, [selectedBiz]);

  const updateSettings = async (newSettings: AppSettings) => {
    await setDoc(doc(db, getCol('settings', colPrefix), 'global'), newSettings, { merge: true });
  };

  const DEFAULT_HP_FORMULA: HpFormula = { baseFee: 1000, supplyPriceRate: 0.12, extraFee: 2300, silbaeAddSupply: true, silbaeRate: 0.12 };
  const hpFormula: HpFormula = { ...DEFAULT_HP_FORMULA, ...settings.hpFormula };

  // 가구매비용계산기 편집용 로컬 state
  const [hpFormulaEdit, setHpFormulaEdit] = useState<HpFormula>(DEFAULT_HP_FORMULA);
  const [hpFormulaSaving, setHpFormulaSaving] = useState(false);
  useEffect(() => { setHpFormulaEdit({ ...DEFAULT_HP_FORMULA, ...settings.hpFormula }); }, [settings.hpFormula]);

  // Firestore Sync: Export Templates
  const [exportTemplates, setExportTemplates] = useState<ExportTemplate[]>(DEFAULT_EXPORT_TEMPLATES);
  const [templateEditModal, setTemplateEditModal] = useState<ExportTemplate | null>(null);
  const [templateListModal, setTemplateListModal] = useState(false);

  useEffect(() => {
    if (!selectedBiz) { setExportTemplates(DEFAULT_EXPORT_TEMPLATES); return; }
    const unsub = onSnapshot(doc(db, getCol('settings', colPrefix), 'exportTemplates'), (d) => {
      if (d.exists()) {
        const data = d.data();
        setExportTemplates(data.templates as ExportTemplate[] || DEFAULT_EXPORT_TEMPLATES);
      } else {
        setExportTemplates(DEFAULT_EXPORT_TEMPLATES);
      }
    });
    return () => unsub();
  }, [selectedBiz]);

  const saveExportTemplates = async (templates: ExportTemplate[]) => {
    await setDoc(doc(db, getCol('settings', colPrefix), 'exportTemplates'), { templates });
  };

  // Firestore Sync: Platform Configs
  // sharedPlatformConfigs = 안군농원에 설정된 공유 플랫폼 (모든 사업자 사용 가능)
  const [sharedPlatformConfigs, setSharedPlatformConfigs] = useState<PlatformConfig[]>([]);
  // platformConfigs = 현재 사업자 전용 플랫폼
  const [platformConfigs, setPlatformConfigs] = useState<PlatformConfig[]>([]);
  const [platformConfigModal, setPlatformConfigModal] = useState(false);
  const [platformEditItem, setPlatformEditItem] = useState<PlatformConfig | null>(null);

  // 항상 안군농원의 공유 플랫폼 로드
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'platformConfigs'), (d) => {
      setSharedPlatformConfigs(d.exists() ? (d.data().configs as PlatformConfig[] || []) : []);
    });
    return () => unsub();
  }, []);

  // 현재 사업자 전용 플랫폼 로드 (안군농원은 공유=전용이므로 비움)
  useEffect(() => {
    if (!selectedBiz || colPrefix === '') { setPlatformConfigs([]); return; }
    const unsub = onSnapshot(doc(db, getCol('settings', colPrefix), 'platformConfigs'), (d) => {
      setPlatformConfigs(d.exists() ? (d.data().configs as PlatformConfig[] || []) : []);
    });
    return () => unsub();
  }, [selectedBiz]);

  // 전체 플랫폼 = 공유 + 전용 (안군농원은 공유만)
  const allPlatformConfigs: PlatformConfig[] = colPrefix === ''
    ? sharedPlatformConfigs
    : [...sharedPlatformConfigs, ...platformConfigs];

  const savePlatformConfigs = async (configs: PlatformConfig[]) => {
    if (colPrefix === '') {
      // 안군농원: 공유 플랫폼 저장
      await setDoc(doc(db, 'settings', 'platformConfigs'), { configs });
    } else {
      // 다른 사업자: 전용 플랫폼 저장
      await setDoc(doc(db, getCol('settings', colPrefix), 'platformConfigs'), { configs });
    }
  };

  // Master sheet state (세션 내 유지, Firebase 저장 안 함)
  const [masterSheets, setMasterSheets] = useState<Array<{
    platformId: string;
    platformName: string;
    orderMap: Map<string, Record<string, string>>;
    total: number;
    allRows: string[][];
    headerRowIndex: number;
    trackingColIndex: number;
    originalFileName: string;
  }>>([]);
  const masterSheetData = masterSheets.length > 0
    ? { platformId: masterSheets[0].platformId, platformName: masterSheets[0].platformName, orderMap: (() => { const m = new Map<string, Record<string, string>>(); masterSheets.forEach(s => s.orderMap.forEach((v, k) => m.set(k, v))); return m; })(), total: masterSheets.reduce((a, s) => a + s.total, 0) }
    : null;
  const [masterUploadPlatformId, setMasterUploadPlatformId] = useState<string>('');
  const [masterUnmatchedExpanded, setMasterUnmatchedExpanded] = useState(false);
  // Waybill (운송장) state
  const [waybillMap, setWaybillMap] = useState<Map<string, string>>(new Map());
  const [waybillSources, setWaybillSources] = useState<{ name: string; count: number }[]>([]);

  const getExportCellValue = (entry: ManualEntry, col: ExportColumn, masterRow?: Record<string, string>): string => {
    if (masterRow && masterSheetData && col.source !== 'fixed' && col.source !== 'empty' && col.source !== 'bizName' && col.source !== 'bizPhone' && col.source !== 'bizAddress' && col.source !== 'masterCol') {
      const platform = allPlatformConfigs.find(p => p.id === masterSheetData.platformId);
      const mappedCol = platform?.fieldMapping?.[col.source];
      if (mappedCol && mappedCol.trim()) {
        const val = masterRow[mappedCol] ?? '';
        return col.stripDash ? val.replace(/-/g, '') : val;
      }
    }
    switch (col.source) {
      case 'orderNumber': return entry.orderNumber || '';
      case 'name1': return entry.name1 || '';
      case 'name2': return entry.name2 || '';
      case 'ordererName': return entry.ordererName || '';
      case 'address': return entry.address || '';
      case 'emergencyContact': {
        const v = entry.emergencyContact || '';
        return col.stripDash ? v.replace(/-/g, '') : v;
      }
      case 'product': return entry.product || '';
      case 'memo': return entry.memo || '';
      case 'trackingNumber': return entry.trackingNumber || '';
      case 'accountNumber': return entry.accountNumber || '';
      case 'paymentAmount': return entry.paymentAmount ? String(entry.paymentAmount) : '';
      case 'count': return entry.count ? String(entry.count) : '';
      case 'date': return entry.date || '';
      case 'bizName': return bizInfo?.name || '';
      case 'bizPhone': return bizInfo?.phone || '';
      case 'bizAddress': return bizInfo?.address || '';
      case 'fixed': return col.fixedValue || '';
      case 'masterCol': return col.masterColName ? (masterRow?.[col.masterColName] ?? '') : '';
      case 'empty': return '';
      default: return '';
    }
  };

  const parseMasterSheet = async (file: File, platformConfig: PlatformConfig): Promise<{
    orderMap: Map<string, Record<string, string>>;
    total: number;
    allRows: string[][];
    headerRowIndex: number;
    trackingColIndex: number;
  }> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
    const headerRow = (allRows[platformConfig.headerRow] || []).map(String);
    const orderMap = new Map<string, Record<string, string>>();
    for (let i = platformConfig.headerRow + 1; i < allRows.length; i++) {
      const row = allRows[i];
      const rowObj: Record<string, string> = {};
      headerRow.forEach((h, idx) => { if (h) rowObj[h] = String(row[idx] ?? ''); });
      const orderNum = rowObj[platformConfig.orderNumColName]?.trim();
      if (orderNum) orderMap.set(orderNum, rowObj);
    }
    const trackingColIndex = headerRow.findIndex(h => h.includes('운송장') || h.includes('송장번호') || h.includes('트래킹'));
    return { orderMap, total: orderMap.size, allRows, headerRowIndex: platformConfig.headerRow, trackingColIndex };
  };

  const parseWaybillFile = async (file: File): Promise<{ trackingMap: Map<string, string>; count: number }> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, allRows.length); i++) {
      if (allRows[i].some(c => String(c).trim())) { headerIdx = i; break; }
    }
    const headers = allRows[headerIdx].map(String);
    const orderColIdx = headers.findIndex(h => h.includes('주문번호') || h.toLowerCase().includes('order'));
    const trackColIdx = headers.findIndex(h => h.includes('운송장') || h.includes('송장') || h.includes('트래킹'));
    if (orderColIdx === -1 || trackColIdx === -1) {
      throw new Error(`주문번호 또는 운송장번호 컬럼을 찾을 수 없습니다.\n인식된 헤더: ${headers.join(', ')}`);
    }
    const trackingMap = new Map<string, string>();
    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      const orderNum = String(row[orderColIdx] ?? '').trim();
      const trackingNum = String(row[trackColIdx] ?? '').trim();
      if (orderNum && trackingNum) trackingMap.set(orderNum, trackingNum);
    }
    return { trackingMap, count: trackingMap.size };
  };

  const parseSampleColumns = async (file: File, headerRow: number): Promise<string[]> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
    return ((allRows[headerRow] || []).map(String).filter(h => h.trim()));
  };

  const createEmptyRow = (date?: string): ManualEntry => ({
    id: Math.random().toString(36).substr(2, 9),
    proofImage: '',
    count: 0,
    product: '',
    date: date || toLocalDateStr(),
    name1: '',
    name2: '',
    ordererName: '',
    orderNumber: '',
    address: '',
    memo: '',
    paymentAmount: 0,
    emergencyContact: '',
    accountNumber: '',
    trackingNumber: '',
    beforeDeposit: false,
    afterDeposit: false,
    createdAt: Date.now()
  });

  // Firestore Sync: Products
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    if (!selectedBiz) { setProducts([]); return; }
    const q = query(collection(db, getCol('products', colPrefix)));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(list);
    });
    return () => unsub();
  }, [selectedBiz]);

  // Firestore Sync: Manual Entries
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [manualEntriesLoaded, setManualEntriesLoaded] = useState(false);
  const [ocrLoadingIds, setOcrLoadingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedBiz) { setManualEntries([]); setManualEntriesLoaded(false); return; }
    const colName = getCol('manualEntries', colPrefix);
    const q = query(collection(db, colName));
    const unsub = onSnapshot(q, (snapshot) => {
      const defaults = createEmptyRow();
      const list = snapshot.docs.map(d => {
        const data = d.data();
        return {
          ...defaults,
          ...data,
          id: d.id,
          count: data.count ?? 0,
          paymentAmount: data.paymentAmount ?? 0,
          beforeDeposit: data.beforeDeposit ?? false,
          afterDeposit: data.afterDeposit ?? false,
          proofImage: loadProofImage(d.id),
          product: data.product ?? '',
          date: data.date ?? '',
          name1: data.name1 ?? '',
          name2: data.name2 ?? '',
          ordererName: data.ordererName ?? '',
          orderNumber: data.orderNumber != null ? String(data.orderNumber) : '',
          address: data.address ?? '',
          memo: data.memo ?? '',
          emergencyContact: data.emergencyContact ?? '',
          accountNumber: data.accountNumber ?? '',
          trackingNumber: data.trackingNumber ?? '',
        } as ManualEntry;
      });
      // 마이그레이션: createdAt 없는 행에 자동 부여
      const missing = list.filter(e => !e.createdAt);
      if (missing.length > 0) {
        const byDate: Record<string, typeof missing> = {};
        missing.forEach(e => {
          const d = e.date || '0000';
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(e);
        });
        const batch = writeBatch(db);
        let base = 1000000000000;
        Object.keys(byDate).sort().forEach(date => {
          byDate[date].forEach((e, i) => {
            batch.update(doc(db, colName, e.id), { createdAt: base + i });
          });
          base += byDate[date].length;
        });
        batch.commit().catch(err => console.error('[Migration] createdAt 부여 실패:', err));
      }

      // Firestore에 남아있는 proofImage 필드 일괄 삭제 (기존 데이터 정리 - 비용 절감)
      const withFirestoreImage = snapshot.docs.filter(d => d.data().proofImage);
      if (withFirestoreImage.length > 0) {
        const cleanBatch = writeBatch(db);
        withFirestoreImage.forEach(d => cleanBatch.update(doc(db, colName, d.id), { proofImage: deleteField() }));
        cleanBatch.commit().catch(err => console.error('[Migration] proofImage 정리 실패:', err));
      }

      list.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      setManualEntries(list);
      setManualEntriesLoaded(true);
    });
    return () => unsub();
  }, [selectedBiz]);

  // Firestore Sync: Review Entries
  const [reviewEntries, setReviewEntries] = useState<ReviewEntry[]>([]);
  useEffect(() => {
    if (!selectedBiz) { setReviewEntries([]); return; }
    const q = query(collection(db, getCol('reviewEntries', colPrefix)));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewEntry));
      list.sort((a, b) => b.date.localeCompare(a.date));
      setReviewEntries(list);
    });
    return () => unsub();
  }, [selectedBiz]);

  // Firestore Sync: Product Prices
  const [productPrices, setProductPrices] = useState<ProductPrice[]>([]);
  useEffect(() => {
    if (!selectedBiz) { setProductPrices([]); return; }
    const q = query(collection(db, getCol('productPrices', colPrefix)));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductPrice));
      setProductPrices(list);
    });
    return () => unsub();
  }, [selectedBiz]);

  const [newProductPrice, setNewProductPrice] = useState({ name: '', price: 0 });

  // Firestore Sync: Sales Daily
  const [salesDaily, setSalesDaily] = useState<SalesDailyEntry[]>([]);
  const salesDailyRef = useRef<SalesDailyEntry[]>([]);
  const [salesDailyLoaded, setSalesDailyLoaded] = useState(false);
  useEffect(() => {
    if (!selectedBiz) { setSalesDaily([]); salesDailyRef.current = []; setSalesDailyLoaded(false); return; }
    const q = query(collection(db, getCol('salesDaily', colPrefix)));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SalesDailyEntry));
      list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setSalesDaily(list);
      salesDailyRef.current = list;
      setSalesDailyLoaded(true);
    });
    return () => unsub();
  }, [selectedBiz]);
  // monthlyOverhead: 업무일지 비용시트에서 파싱된 공통 경비 (이자 제외, 연동업체 없는 항목)
  // key = "YYYY-MM", value = { 물류비: 15890, 식비: 32434, ... }
  // getDocs(일회성 읽기) + 업로드/삭제 시 in-memory 갱신 → Firestore 읽기 최소화
  const [monthlyOverhead, setMonthlyOverhead] = useState<Record<string, Record<string, number>>>({});
  // manualOverhead: 손익표에서 직접 입력한 비용 (Firestore doc ID: manual-YYYY-MM)
  const [manualOverhead, setManualOverhead] = useState<Record<string, { id: string; name: string; amount: number; date?: string }[]>>({});
  const reloadOverheadRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!selectedBiz) { setMonthlyOverhead({}); setManualOverhead({}); reloadOverheadRef.current = null; return; }
    const reload = async () => {
      const snap = await getDocs(collection(db, getCol('monthlyOverhead', colPrefix)));
      const result: Record<string, Record<string, number>> = {};
      const manualResult: Record<string, { id: string; name: string; amount: number; date?: string }[]> = {};
      snap.docs.forEach(d => {
        const data = d.data() as { month: string; categories?: Record<string, number>; items?: { name: string; amount: number; date?: string }[]; isManual?: boolean };
        if (!data.month) return;
        if (data.isManual) {
          if (Array.isArray(data.items)) {
            manualResult[data.month] = data.items.map((item, i) => ({
              id: `${data.month}-${i}-${item.name}`,
              name: item.name || '',
              amount: Number(item.amount) || 0,
              date: item.date || undefined,
            }));
          } else if (data.categories) {
            manualResult[data.month] = Object.entries(data.categories).map(([name, amount], i) => ({
              id: `${data.month}-${i}-${name}`,
              name,
              amount: Number(amount) || 0,
            }));
          }
        } else if (data.categories) {
          if (!result[data.month]) result[data.month] = {};
          Object.entries(data.categories).forEach(([cat, amt]) => {
            result[data.month][cat] = (result[data.month][cat] || 0) + (Number(amt) || 0);
          });
        }
      });
      setMonthlyOverhead(result);
      setManualOverhead(manualResult);
    };
    reloadOverheadRef.current = reload;
    reload();
  }, [selectedBiz]);

  const [salesMonth, setSalesMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const salesMonthStr = `${salesMonth.year}-${String(salesMonth.month).padStart(2, '0')}`;
  const salesFileRef = useRef<HTMLInputElement>(null);
  const [salesSubTab, setSalesSubTab] = useState<SalesSubTab>('summary');

  // Auto-sync: 비활성화됨 (수동 관리)
  // 1월·2월은 수동 입력 데이터 - 보호 대상
  const isProtectedMonth = (monthStr: string) => monthStr === '2026-01' || monthStr === '2026-02';

  const [dailyMemos, setDailyMemos] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!selectedBiz) { setDailyMemos({}); return; }
    const unsub = onSnapshot(collection(db, getCol('dailyMemos', colPrefix)), (snapshot) => {
      const m: Record<string, string> = {};
      snapshot.docs.forEach(d => { m[d.id] = (d.data() as any).memo || ''; });
      setDailyMemos(m);
    });
    return () => unsub();
  }, [selectedBiz]);
  // localStorage 키를 사업자별로 분리 (안군농원은 기존 키 유지)
  const lsKey = (key: string) => !selectedBiz || selectedBiz === 'angun' ? key : `${selectedBiz}_${key}`;
  // selectedBiz 변경 시 localStorage에서 다시 로드
  useEffect(() => {
    if (!selectedBiz) return;
    const lk = (key: string) => selectedBiz === 'angun' ? key : `${selectedBiz}_${key}`;
    try { const s = localStorage.getItem(lk('manualColWidths')); setColWidths(s ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(s) } : { ...DEFAULT_COL_WIDTHS }); } catch { setColWidths({ ...DEFAULT_COL_WIDTHS }); }
    // 사업자 전환 시 마스터 주문서·운송장 초기화 (각 사업자 개별 관리)
    setMasterSheets([]);
    setMasterUploadPlatformId('');
    setMasterUnmatchedExpanded(false);
    setWaybillMap(new Map());
    setWaybillSources([]);
  }, [selectedBiz]);

  // Sales undo/redo
  const [salesUndoStack, setSalesUndoStack] = useState<{ type: string, entries: { id: string, data: any }[] }[]>([]);
  const [salesRedoStack, setSalesRedoStack] = useState<{ type: string, entries: { id: string, data: any }[] }[]>([]);

  const salesUpdate = async (entryId: string, field: string, value: any) => {
    const entry = salesDaily.find(e => e.id === entryId);
    if (!entry) return;
    const oldVal = (entry as any)[field];
    if (oldVal === value) return;
    const undoData: any = { [field]: oldVal };
    const updateData: any = { [field]: value };
    if (field === 'housePurchase') {
      undoData.hpManual = (entry as any).hpManual ?? false;
      updateData.hpManual = true;
    }
    setSalesUndoStack(prev => [...prev, { type: 'update', entries: [{ id: entryId, data: undoData }] }]);
    setSalesRedoStack([]);
    await updateDoc(doc(db, getCol('salesDaily', colPrefix), entryId), updateData);
  };

  const handleSalesUndo = async () => {
    if (salesUndoStack.length === 0) return;
    const last = salesUndoStack[salesUndoStack.length - 1];
    setSalesUndoStack(prev => prev.slice(0, -1));
    const batch = writeBatch(db);
    const redoEntries: { id: string, data: any }[] = [];
    for (const e of last.entries) {
      const current = salesDaily.find(s => s.id === e.id);
      if (last.type === 'update') {
        const currentData: any = {};
        Object.keys(e.data).forEach(k => { currentData[k] = current ? (current as any)[k] : 0; });
        redoEntries.push({ id: e.id, data: currentData });
        batch.update(doc(db, getCol('salesDaily', colPrefix), e.id), e.data);
      } else if (last.type === 'delete') {
        batch.set(doc(db, getCol('salesDaily', colPrefix), e.id), e.data);
        redoEntries.push({ id: e.id, data: {} });
      } else if (last.type === 'add') {
        if (current) redoEntries.push({ id: e.id, data: { ...current } });
        batch.delete(doc(db, getCol('salesDaily', colPrefix), e.id));
      }
    }
    const redoType = last.type === 'delete' ? 'add' : last.type === 'add' ? 'delete' : 'update';
    setSalesRedoStack(prev => [...prev, { type: redoType, entries: redoEntries }]);
    await batch.commit();
  };

  const handleSalesRedo = async () => {
    if (salesRedoStack.length === 0) return;
    const last = salesRedoStack[salesRedoStack.length - 1];
    setSalesRedoStack(prev => prev.slice(0, -1));
    const batch = writeBatch(db);
    const undoEntries: { id: string, data: any }[] = [];
    for (const e of last.entries) {
      const current = salesDaily.find(s => s.id === e.id);
      if (last.type === 'update') {
        const currentData: any = {};
        Object.keys(e.data).forEach(k => { currentData[k] = current ? (current as any)[k] : 0; });
        undoEntries.push({ id: e.id, data: currentData });
        batch.update(doc(db, getCol('salesDaily', colPrefix), e.id), e.data);
      } else if (last.type === 'delete') {
        batch.set(doc(db, getCol('salesDaily', colPrefix), e.id), e.data);
        undoEntries.push({ id: e.id, data: {} });
      } else if (last.type === 'add') {
        if (current) undoEntries.push({ id: e.id, data: { ...current } });
        batch.delete(doc(db, getCol('salesDaily', colPrefix), e.id));
      }
    }
    const undoType = last.type === 'delete' ? 'add' : last.type === 'add' ? 'delete' : 'update';
    setSalesUndoStack(prev => [...prev, { type: undoType, entries: undoEntries }]);
    await batch.commit();
  };

  const handleSalesAddRow = async (product: string) => {
    // 해당 월의 마지막 날짜 다음 날 찾기
    const existingDates = salesDaily.filter(e => e.product === product && e.date?.startsWith(salesMonthStr)).map(e => e.date).sort();
    const daysInMonth = new Date(salesMonth.year, salesMonth.month, 0).getDate();
    let newDate = '';
    if (existingDates.length === 0) {
      newDate = `${salesMonthStr}-01`;
    } else {
      const lastDay = parseInt(existingDates[existingDates.length - 1].split('-')[2]);
      const nextDay = lastDay + 1;
      if (nextDay > daysInMonth) { alert('해당 월의 마지막 날짜입니다.'); return; }
      newDate = `${salesMonthStr}-${String(nextDay).padStart(2, '0')}`;
    }
    const docId = `${newDate}_${product}_${Date.now()}`;
    const autoHP = calcHousePurchase(product, newDate);
    const newEntry = { date: newDate, product, productDetail: '', quantity: 0, sellingPrice: 0, supplyPrice: 0, marginPerUnit: 0, totalMargin: 0, adCost: 0, housePurchase: autoHP, solution: 0, refund: 0 };
    setSalesUndoStack(prev => [...prev, { type: 'add', entries: [{ id: docId, data: {} }] }]);
    setSalesRedoStack([]);
    await setDoc(doc(db, getCol('salesDaily', colPrefix), docId), newEntry);
  };

  // 가구매 자동계산 (공식은 설정에서 동적 변경 가능)
  // 주문번호에 "실배" 포함 시 silbaeAddSupply 설정에 따라 공급가 추가
  const calcHousePurchase = (product: string, date: string) => {
    // 1월·2월은 수동 입력 데이터 - 자동계산 하지 않음
    if (isProtectedMonth(date.substring(0, 7))) return 0;
    const entries = manualEntries.filter(e => e.product === product && e.date === date);
    if (entries.length === 0) return 0;
    const pp = productPrices.find(p => p.name === product);
    const { baseFee, supplyPriceRate, extraFee, silbaeAddSupply, silbaeRate } = hpFormula;
    const total = entries.reduce((sum, e) => {
      const isCoupon = e.couponApplied !== false;
      const sellPrice = isCoupon ? (pp?.sellingPrice || pp?.price || 0) : (pp?.sellingPriceNoCoupon || pp?.priceNoCoupon || pp?.sellingPrice || pp?.price || 0);
      const supPrice = pp?.supplyPrice || (sellPrice - 1000);
      if (sellPrice <= 0) return sum;
      const baseUnitCost = Math.round(extraFee + sellPrice * supplyPriceRate + baseFee);
      const unitCost = (silbaeAddSupply && String(e.orderNumber || '').includes('실배')) ? Math.round(supPrice + sellPrice * silbaeRate) : baseUnitCost;
      return sum + unitCost;
    }, 0);
    return -total;
  };

  // 구매목록 변경 시 가구매 자동 재계산 (1월·2월 보호)
  useEffect(() => {
    if (!salesDailyLoaded || manualEntries.length === 0) return;
    const update = async () => {
      const batch = writeBatch(db);
      let hasUpdate = false;

      // 1) 기존 salesDaily 항목 업데이트 (품목명 정규화 매칭)
      const sdMap = new Map<string, SalesDailyEntry>();
      for (const sd of salesDaily) {
        sdMap.set(`${sd.date}|||${normProductName(sd.product)}`, sd);
        if (!sd.date || isProtectedMonth(sd.date.substring(0, 7))) continue;
        if ((sd as any).hpManual) continue;
        const sdNorm = normProductName(sd.product);
        const matchedEntries = manualEntries.filter(e => normProductName(e.product) === sdNorm && e.date === sd.date);
        let hp = 0;
        if (matchedEntries.length > 0) {
          const pp = productPrices.find(p => normProductName(p.name) === sdNorm);
          const { baseFee, supplyPriceRate, extraFee, silbaeAddSupply, silbaeRate } = hpFormula;
          hp = -matchedEntries.reduce((sum, e) => {
            const isCoupon = e.couponApplied !== false;
            const sellPrice = isCoupon ? (pp?.sellingPrice || pp?.price || 0) : (pp?.sellingPriceNoCoupon || pp?.priceNoCoupon || pp?.sellingPrice || pp?.price || 0);
            const supPrice = pp?.supplyPrice || (sellPrice - 1000);
            if (sellPrice <= 0) return sum;
            const baseUnitCost = Math.round(extraFee + sellPrice * supplyPriceRate + baseFee);
            const unitCost = (silbaeAddSupply && String(e.orderNumber || '').includes('실배')) ? Math.round(supPrice + sellPrice * silbaeRate) : baseUnitCost;
            return sum + unitCost;
          }, 0);
        }
        if (sd.housePurchase !== hp) {
          batch.update(doc(db, getCol('salesDaily', colPrefix), sd.id), { housePurchase: hp });
          hasUpdate = true;
        }
      }

      // 2) salesDaily에 없는 날짜+품목 조합은 새로 생성 (정규화 키 기준)
      const combos = new Map<string, { date: string; product: string; count: number }>();
      for (const me of manualEntries) {
        if (!me.product || !me.date || isProtectedMonth(me.date.substring(0, 7))) continue;
        const key = `${me.date}|||${normProductName(me.product)}`;
        const prev = combos.get(key);
        if (prev) prev.count += 1;
        else combos.set(key, { date: me.date, product: me.product, count: 1 });
      }
      for (const [key, { date, product }] of combos) {
        if (sdMap.has(key)) continue; // 이미 위에서 처리됨
        const pNorm = normProductName(product);
        const pp = productPrices.find(p => normProductName(p.name) === pNorm);
        const cleanProduct = pp?.name || pNorm;
        const { baseFee, supplyPriceRate, extraFee, silbaeAddSupply, silbaeRate } = hpFormula;
        const entriesForCombo = manualEntries.filter(e => normProductName(e.product) === pNorm && e.date === date);
        const hp = -entriesForCombo.reduce((sum, e) => {
          const isCoupon = e.couponApplied !== false;
          const sellPrice = isCoupon ? (pp?.sellingPrice || pp?.price || 0) : (pp?.sellingPriceNoCoupon || pp?.priceNoCoupon || pp?.sellingPrice || pp?.price || 0);
          const supPrice = pp?.supplyPrice || (sellPrice - 1000);
          if (sellPrice <= 0) return sum;
          const baseUnitCost = Math.round(extraFee + sellPrice * supplyPriceRate + baseFee);
          const unitCost = (silbaeAddSupply && String(e.orderNumber || '').includes('실배')) ? Math.round(supPrice + sellPrice * silbaeRate) : baseUnitCost;
          return sum + unitCost;
        }, 0);
        if (hp === 0) continue;
        const docId = `${date}_${cleanProduct}`;
        batch.set(doc(db, getCol('salesDaily', colPrefix), docId), {
          date, product: cleanProduct, productDetail: '', quantity: 0, sellingPrice: 0,
          supplyPrice: 0, marginPerUnit: 0, totalMargin: 0,
          adCost: 0, housePurchase: hp, solution: 0,
        }, { merge: true });
        hasUpdate = true;
      }

      if (hasUpdate) await batch.commit();
    };
    update();
  }, [manualEntries, salesDailyLoaded]);

  const handleSalesDeleteRow = async (entry: SalesDailyEntry) => {
    const { id, ...data } = entry;
    setSalesUndoStack(prev => [...prev, { type: 'delete', entries: [{ id, data }] }]);
    setSalesRedoStack([]);
    await deleteDoc(doc(db, getCol('salesDaily', colPrefix), id));
  };

  const handleSalesAddProduct = async () => {
    const name = prompt('품목명을 입력하세요');
    if (!name || !name.trim()) return;
    const product = name.trim();
    // 이미 해당 월에 존재하는지 확인
    if (salesDaily.some(e => e.product === product && e.date?.startsWith(salesMonthStr))) {
      alert('이미 존재하는 품목입니다.');
      return;
    }
    const newDate = `${salesMonthStr}-01`;
    const docId = `${newDate}_${product}`;
    const newEntry = { date: newDate, product, productDetail: '', quantity: 0, sellingPrice: 0, supplyPrice: 0, marginPerUnit: 0, totalMargin: 0, adCost: 0, housePurchase: 0, solution: 0, refund: 0 };
    setSalesUndoStack(prev => [...prev, { type: 'add', entries: [{ id: docId, data: {} }] }]);
    setSalesRedoStack([]);
    await setDoc(doc(db, getCol('salesDaily', colPrefix), docId), newEntry);
  };

  const handleSalesDeleteProduct = async (product: string) => {
    if (!confirm(`"${product}" 품목의 ${salesMonth.year}.${salesMonth.month}월 데이터를 모두 삭제할까요?`)) return;
    const normTarget = normProductName(product);
    const targets = salesDaily.filter(e => normProductName(e.product) === normTarget && e.date?.startsWith(salesMonthStr));
    if (targets.length === 0) return;
    const batch = writeBatch(db);
    const undoEntries: { id: string, data: any }[] = [];
    for (const e of targets) {
      const { id, ...data } = e;
      undoEntries.push({ id, data });
      batch.delete(doc(db, getCol('salesDaily', colPrefix), id));
    }
    setSalesUndoStack(prev => [...prev, { type: 'delete', entries: undoEntries }]);
    setSalesRedoStack([]);
    await batch.commit();
  };

  // 손익표: 비고 저장
  const handleSaveMemo = async (date: string, memo: string) => {
    await setDoc(doc(db, getCol('dailyMemos', colPrefix), date), { memo });
  };

  // 손익표: 직접 입력 비용 저장
  const saveManualOverheadRows = async (month: string, rows: { id: string; name: string; amount: number; date?: string }[]) => {
    const items = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), amount: r.amount, ...(r.date ? { date: r.date } : {}) }));
    if (items.length === 0) {
      await deleteDoc(doc(db, getCol('monthlyOverhead', colPrefix), `manual-${month}`)).catch(() => {});
    } else {
      await setDoc(doc(db, getCol('monthlyOverhead', colPrefix), `manual-${month}`), { month, items, isManual: true });
    }
    setManualOverhead(prev => ({ ...prev, [month]: rows }));
  };

  // 업무일지 업로드 미리보기 상태
  const [pendingUpload, setPendingUpload] = useState<{
    uploadDate: string;
    salesItems: { docId: string; product: string; productDetail: string; quantity: number; sellingPrice: number; supplyPrice: number; marginPerUnit: number; totalMargin: number; adCost: number; housePurchase: number; solution: number; refund: number; hpManual: boolean }[];
    overheadCategories: Record<string, number>;
  } | null>(null);
  // 마지막 업로드 삭제용
  const [lastUploadInfo, setLastUploadInfo] = useState<{ uploadDate: string; salesDocIds: string[] } | null>(null);

  const handleSalesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isProtectedMonth(salesMonthStr)) {
      alert('1월·2월은 수동 입력 데이터입니다. 엑셀 업로드가 차단됩니다.');
      e.target.value = '';
      return;
    }
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { cellDates: true });

    const sheetName = wb.SheetNames.find(n => n.includes('마진')) || wb.SheetNames[wb.SheetNames.length - 1];
    const ws = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);

    if (rows.length === 0) { alert('마진시트에 데이터가 없습니다.'); return; }

    const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
    const today = new Date();
    const uploadDate = dateMatch ? dateMatch[1]
      : (today.getFullYear() === salesMonth.year && today.getMonth() + 1 === salesMonth.month)
        ? toLocalDateStr(today)
        : `${salesMonthStr}-01`;

    // 판매 항목 합산
    const merged: Record<string, { product: string; details: string[]; quantity: number; sellingPrice: number; supplyPrice: number; totalMargin: number }> = {};

    for (const row of rows) {
      const product = String(row['등록상품명'] || row['업체명'] || '').trim();
      const productDetail = String(row['품목명'] || '').trim();
      if (!product) continue;
      if (!merged[product]) {
        merged[product] = { product, details: [], quantity: 0, sellingPrice: 0, supplyPrice: 0, totalMargin: 0 };
      }
      if (productDetail && !merged[product].details.includes(productDetail)) merged[product].details.push(productDetail);
      merged[product].quantity += Number(row['수량'] || 0);
      merged[product].sellingPrice += Number(row['판매가'] || 0);
      merged[product].supplyPrice += Number(row['공급가'] || 0);
      merged[product].totalMargin += Number(row['총마진'] || 0);
    }

    // 품목별비용 시트 파싱 (반품/광고비/슬롯)
    type CostByProduct = { refund: number; adCost: number; solution: number };
    const costByProductDate: Record<string, CostByProduct> = {};
    const costSheetName = wb.SheetNames.find((n: string) => n.includes('품목별비용'));
    if (costSheetName) {
      const costWs = wb.Sheets[costSheetName];
      const costRows: any[][] = XLSX.utils.sheet_to_json(costWs, { header: 1, defval: '' });
      for (const row of costRows.slice(1)) {
        const category = String(row[0] || '').trim(); // A열: 구분
        const rawDate = row[1];                        // B열: 날짜 (Date 객체)
        const date = rawDate instanceof Date ? toLocalDateStr(rawDate) : String(rawDate || '').trim();
        const product = String(row[4] || '').trim();  // E열: 등록상품명
        const amount = Number(row[8] || 0);           // I열: 금액
        if (!date || !product || !amount) continue;
        const key = `${date}|||${normProductName(product)}`;
        if (!costByProductDate[key]) costByProductDate[key] = { refund: 0, adCost: 0, solution: 0 };
        if (category === '반품') costByProductDate[key].refund += amount;
        else if (category === '광고비') costByProductDate[key].adCost += amount;
        else if (category === '슬롯') costByProductDate[key].solution += amount;
      }
    }

    // 비용시트 파싱 (이자 제외, 연동업체 없는 행만 → 공통 오버헤드)
    const overheadCategories: Record<string, number> = {};
    const expenseSheetName = wb.SheetNames.find((n: string) => n.includes('비용시트'));
    if (expenseSheetName) {
      const expWs = wb.Sheets[expenseSheetName];
      const expRows: any[][] = XLSX.utils.sheet_to_json(expWs, { header: 1, defval: '' });
      for (const row of expRows.slice(1)) {
        const category = String(row[0] || '').trim(); // A: 구분
        const amount = Number(row[1] || 0);           // B: 금액
        const linkedCompany = String(row[3] || '').trim(); // D: 연동업체
        if (!category || !amount) continue;
        if (category === '합계') continue;  // 합계 행 스킵
        if (linkedCompany) continue;        // 연동업체 있으면 스킵 (품목별 처리 대상)
        overheadCategories[category] = (overheadCategories[category] || 0) + amount;
      }
    }

    // 미리보기 데이터 세팅 (아직 저장 안 함)
    const salesItems = Object.values(merged).map(m => {
      const existingSD = salesDaily.find(entry => entry.date === uploadDate && normProductName(entry.product) === normProductName(m.product));
      const cost = costByProductDate[`${uploadDate}|||${normProductName(m.product)}`];
      return {
        docId: existingSD?.id || `${uploadDate}_${m.product}`,
        product: m.product,
        productDetail: m.details.join(', '),
        quantity: m.quantity,
        sellingPrice: m.sellingPrice,
        supplyPrice: m.supplyPrice,
        marginPerUnit: m.quantity > 0 ? Math.round(m.totalMargin / m.quantity) : 0,
        totalMargin: m.totalMargin,
        adCost: cost ? cost.adCost : (existingSD?.adCost || 0),
        housePurchase: existingSD?.housePurchase || 0,
        solution: cost ? cost.solution : (existingSD?.solution || 0),
        refund: cost ? cost.refund : (existingSD?.refund ?? 0),
        hpManual: existingSD?.hpManual || false,
      };
    });

    setPendingUpload({ uploadDate, salesItems, overheadCategories });
    e.target.value = '';
  };

  // 업로드 미리보기 확인 → 실제 저장
  const handleConfirmUpload = async () => {
    if (!pendingUpload) return;
    const { uploadDate, salesItems } = pendingUpload;
    const batch = writeBatch(db);
    const savedSalesIds: string[] = [];

    for (const item of salesItems) {
      batch.set(doc(db, getCol('salesDaily', colPrefix), item.docId), {
        date: uploadDate,
        product: item.product,
        productDetail: item.productDetail,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        supplyPrice: item.supplyPrice,
        marginPerUnit: item.marginPerUnit,
        totalMargin: item.totalMargin,
        adCost: item.adCost,
        housePurchase: item.housePurchase,
        solution: item.solution,
        refund: item.refund,
        hpManual: item.hpManual,
      });
      savedSalesIds.push(item.docId);
    }

    await batch.commit();

    // 오버헤드 비용 저장 (비용시트에서 파싱된 공통 경비)
    const { overheadCategories } = pendingUpload;
    if (Object.keys(overheadCategories).length > 0) {
      await setDoc(doc(db, getCol('monthlyOverhead', colPrefix), uploadDate), {
        month: uploadDate.substring(0, 7),
        categories: overheadCategories,
      });
      await reloadOverheadRef.current?.();
    }

    setLastUploadInfo({ uploadDate, salesDocIds: savedSalesIds });
    setPendingUpload(null);
    alert(`${uploadDate} / ${salesItems.length}개 품목 등록 완료`);
  };

  // 마지막 업로드 삭제
  const handleDeleteLastUpload = async () => {
    if (!lastUploadInfo) return;
    if (!confirm(`${lastUploadInfo.uploadDate} 업로드 데이터를 삭제하시겠습니까?\n\n• 판매 ${lastUploadInfo.salesDocIds.length}건`)) return;
    const batch = writeBatch(db);
    for (const id of lastUploadInfo.salesDocIds) {
      batch.delete(doc(db, getCol('salesDaily', colPrefix), id));
    }
    await batch.commit();
    // 오버헤드 비용 삭제 (없으면 Firestore가 조용히 무시)
    await deleteDoc(doc(db, getCol('monthlyOverhead', colPrefix), lastUploadInfo.uploadDate));
    await reloadOverheadRef.current?.();
    alert(`${lastUploadInfo.uploadDate} 업로드 데이터가 삭제되었습니다.`);
    setLastUploadInfo(null);
  };

  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSubmittedType, setLastSubmittedType] = useState<'apply' | 'review' | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '', guideText: '', refundAmount: 0, totalQuota: 10, thumbnail: ''
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ kakaoNick: '', phoneNumber: '', proofImage: '', orderNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [depositSubTab, setDepositSubTab] = useState<'before' | 'after'>('before');
  const [selectedDepositIds, setSelectedDepositIds] = useState<Set<string>>(new Set());
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
  // manualViewDate kept for backward compat but no longer used directly (replaced by range)
  const [manualViewDate] = useState<string>(toLocalDateStr());
  const [selectedManualIds, setSelectedManualIds] = useState<Set<string>>(new Set());

  const [depositBeforeDate, setDepositBeforeDate] = useState<string>('all');
  const [depositAfterDate, setDepositAfterDate] = useState<string>(toLocalDateStr());
  const [depositActionDate, setDepositActionDate] = useState<string>(toLocalDateStr());

  const [manualSearch, setManualSearch] = useState('');

  const [depositSearch, setDepositSearch] = useState('');
  const [debouncedDepositSearch, setDebouncedDepositSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ManualEntry; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'asc' });

  const composingRef = useRef(false);
  const [debouncedManualSearch, setDebouncedManualSearch] = useState('');

  // Date range for purchase list
  const [manualViewDateStart, setManualViewDateStart] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 4); return toLocalDateStr(d);
  });
  const [manualViewDateEnd, setManualViewDateEnd] = useState<string>(() => {
    return toLocalDateStr();
  });

  // Color picker state (폰트색 / 행색상 / 셀색상)
  const [colorPicker, setColorPicker] = useState<{ type: 'text' | 'bg' | 'cell'; x: number; y: number; entryId?: string; cellField?: string } | null>(null);

  // 품목 일괄변경 팝오버
  const [productPicker, setProductPicker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!productPicker) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.product-picker-popup')) setProductPicker(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [productPicker]);

  const applyBulkProduct = async (productName: string) => {
    if (selectedManualIds.size === 0) { setProductPicker(null); return; }
    const ids: string[] = Array.from(selectedManualIds);
    const matchedPrice = productPrices.find(p => p.name === productName);
    try {
      const batch = writeBatch(db);
      const undoEntries: { id: string; data: Partial<ManualEntry> }[] = [];
      ids.forEach(id => {
        const entry = manualEntries.find(e => e.id === id);
        if (!entry) return;
        const updates: Partial<ManualEntry> = { product: productName };
        if (matchedPrice) {
          const isCoupon = entry.couponApplied !== false;
          const basePrice = isCoupon ? matchedPrice.price : (matchedPrice.priceNoCoupon || matchedPrice.price);
          let finalPrice = basePrice;
          if ((entry.orderNumber || '').includes('실배')) finalPrice -= 1000;
          updates.paymentAmount = finalPrice;
        }
        batch.update(doc(db, getCol('manualEntries', colPrefix), id), updates);
        undoEntries.push({
          id,
          data: {
            product: entry.product,
            ...(matchedPrice ? { paymentAmount: entry.paymentAmount } : {}),
          },
        });
      });
      pushUndo({ type: 'update', entries: undoEntries, description: '품목 일괄변경' });
      await batch.commit();
      setProductPicker(null);
    } catch (e) { console.error(e); alert('오류: ' + e); }
  };

  useEffect(() => {
    if (!colorPicker) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.color-picker-popup')) setColorPicker(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPicker]);

  // 네이티브 capture 리스너로 input 셀 우클릭 시 브라우저 메뉴 완전 차단
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('input[data-row]')) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', handler, true);
    return () => document.removeEventListener('contextmenu', handler, true);
  }, []);

  // 실배 자동 주문번호 매핑: 입금전/입금완료 목록에서 주문번호에 "실배"가 포함된 항목의 비고에서 숫자를 추출해 주문번호로 자동 업데이트
  const silbaeProcessingRef = useRef(false);
  useEffect(() => {
    if (adminTab !== 'deposit' || silbaeProcessingRef.current) return;

    const silbaeEntries = manualEntries.filter(e =>
      (e.beforeDeposit || e.afterDeposit) &&
      String(e.orderNumber || '').includes('실배') &&
      e.memo
    );

    if (silbaeEntries.length === 0) return;

    silbaeProcessingRef.current = true;

    const batch = writeBatch(db);
    let updateCount = 0;

    for (const entry of silbaeEntries) {
      const numbers = String(entry.memo).match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const orderNum = numbers.reduce((a, b) => a.length >= b.length ? a : b);
        batch.update(doc(db, getCol('manualEntries', colPrefix), entry.id), { orderNumber: orderNum });
        updateCount++;
      }
    }

    if (updateCount > 0) {
      batch.commit().finally(() => { silbaeProcessingRef.current = false; });
    } else {
      silbaeProcessingRef.current = false;
    }
  }, [adminTab, depositSubTab, manualEntries, colPrefix]);

  const handleColorSelect = async (color: string) => {
    if (!colorPicker) return;
    if (colorPicker.type === 'cell' && colorPicker.entryId && colorPicker.cellField) {
      const entry = manualEntries.find(e => e.id === colorPicker.entryId);
      const existing = entry?.cellColors || {};
      await updateDoc(doc(db, getCol('manualEntries', colPrefix), colorPicker.entryId), { cellColors: { ...existing, [colorPicker.cellField]: color } });
    } else if (selectedManualIds.size > 0) {
      const field = colorPicker.type === 'text' ? 'textColor' : 'rowBgColor';
      const batch = writeBatch(db);
      selectedManualIds.forEach(id => {
        batch.update(doc(db, getCol('manualEntries', colPrefix), id), { [field]: color });
      });
      await batch.commit();
    }
    setColorPicker(null);
  };

  // Row drag selection
  const isDraggingRef = useRef(false);
  const dragStartIndexRef = useRef<number>(-1);
  const dragModeRef = useRef<'add' | 'remove'>('add');
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragActivatedRef = useRef(false);

  // Cell drag selection (Excel-like)
  const [cellSelection, setCellSelection] = useState<{startRow: number, startCol: number, endRow: number, endCol: number} | null>(null);

  // Resizable column widths for purchase list
  const DEFAULT_COL_WIDTHS: Record<string, number> = { photo: 32, id: 28, count: 32, product: 64, coupon: 52, date: 64, name1: 56, name2: 56, orderNumber: 80, address: 64, memo: 56, paymentAmount: 56, emergencyContact: 64, accountNumber: 112, trackingNumber: 80, beforeDeposit: 32, afterDeposit: 32 };
  const [colWidths, setColWidths] = useState<Record<string, number>>({ ...DEFAULT_COL_WIDTHS });
  const resizeColRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const colResizedRef = useRef(false);
  const handleColResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeColRef.current = { key, startX: e.clientX, startW: colWidths[key] };
    const onMove = (ev: MouseEvent) => {
      if (!resizeColRef.current) return;
      const newW = Math.max(20, resizeColRef.current.startW + ev.clientX - resizeColRef.current.startX);
      setColWidths(prev => { const next = { ...prev, [resizeColRef.current!.key]: newW }; localStorage.setItem(lsKey('manualColWidths'), JSON.stringify(next)); return next; });
    };
    const onUp = () => { resizeColRef.current = null; colResizedRef.current = true; setTimeout(() => { colResizedRef.current = false; }, 100); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  };
  const resetColWidth = (key: string) => { setColWidths(prev => { const next = { ...prev, [key]: DEFAULT_COL_WIDTHS[key] }; localStorage.setItem(lsKey('manualColWidths'), JSON.stringify(next)); return next; }); };
  const cellDragRef = useRef({row: -1, col: -1, active: false});

  const [manualCalOpen, setManualCalOpen] = useState(false);
  const [manualCalMonth, setManualCalMonth] = useState(new Date());
  const [depositCalOpen, setDepositCalOpen] = useState(false);
  const [depositCalMonth, setDepositCalMonth] = useState(new Date());

  // (localEdits removed - using uncontrolled inputs now)

  // Undo stack
  const [undoStack, setUndoStack] = useState<{ type: string, entries: { id: string, data: any }[], description: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ type: string, entries: { id: string, data: any }[], description: string }[]>([]);


  // ✅ 디바운스 로직 - 입금관리 검색 (변경 사항 3)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDepositSearch(depositSearch);
    }, 300);

    return () => clearTimeout(timer);
  }, [depositSearch]);

  // 디바운스 로직 - 구매목록 검색 (한글 깨짐 방지)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedManualSearch(manualSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [manualSearch]);

  const getCellColor = (entry: ManualEntry, field: string): string | undefined => {
    return entry.cellColors?.[field] || undefined;
  };

  const handleCellContextMenu = (e: React.MouseEvent, entryId: string, field: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setColorPicker({ type: 'cell', x: e.clientX, y: e.clientY, entryId, cellField: field });
  };

  // --- Uncontrolled input helpers (no cursor jump, no IME issues) ---
  // Sync uncontrolled input from Firestore when cell is NOT focused
  const syncInputValue = (el: HTMLInputElement | null, value: any) => {
    if (el && document.activeElement !== el) {
      const strVal = (value != null && value !== 0 && value !== false) ? String(value) : '';
      if (el.value !== strVal) el.value = strVal;
    }
  };

  // Commit cell value on blur (only if changed)
  const parseDateInput = (raw: string): string => {
    const s = raw.trim().replace(/[.\-\/\s]/g, '');
    if (s.length === 4) return `${new Date().getFullYear()}-${s.slice(0,2)}-${s.slice(2,4)}`;
    if (s.length === 6) return `20${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return '';
  };

  const handleCellBlur = (e: React.FocusEvent<HTMLInputElement>, entry: ManualEntry, field: keyof ManualEntry) => {
    const rawVal = e.target.value;
    let newVal: any = rawVal;
    if (field === 'count') newVal = Number(rawVal) || 0;
    else if (field === 'paymentAmount') newVal = Number(rawVal.replace(/,/g, '')) || 0;
    else if (field === 'date') {
      const parsed = parseDateInput(rawVal);
      if (!parsed) { e.target.value = entry.date ? entry.date.slice(2).replace(/-/g, '.') : ''; return; }
      newVal = parsed;
      e.target.value = parsed.slice(2).replace(/-/g, '.');
    }

    const oldVal = entry[field];
    if (String(newVal) !== String(oldVal != null ? oldVal : '')) {
      updateManualEntry(entry.id, field, newVal);
      // 값 변경 시 팝 효과
      if (rawVal) {
        e.target.classList.add('cell-pop');
        setTimeout(() => e.target.classList.remove('cell-pop'), 300);
      }
    }
  };

  // Handle Enter (commit + move down), Escape (revert)
  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, entry: ManualEntry, field: keyof ManualEntry, idx: number, col: number) => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return; // Don't commit during IME composition
      e.preventDefault();
      const rawVal = e.currentTarget.value;
      let newVal: any = rawVal;
      if (field === 'count') newVal = Number(rawVal) || 0;
      else if (field === 'paymentAmount') newVal = Number(rawVal.replace(/,/g, '')) || 0;
      else if (field === 'date') {
        const parsed = parseDateInput(rawVal);
        if (parsed) { newVal = parsed; e.currentTarget.value = parsed.slice(2).replace(/-/g, '.'); }
        else { e.currentTarget.value = entry.date ? entry.date.slice(2).replace(/-/g, '.') : ''; return; }
      }
      if (String(newVal) !== String(entry[field] != null ? entry[field] : '')) {
        updateManualEntry(entry.id, field, newVal);
      }
      const nextInput = document.querySelector(`input[data-row="${idx + 1}"][data-col="${col}"]`) as HTMLInputElement;
      if (nextInput) nextInput.focus();
      else e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      const origVal = entry[field];
      e.currentTarget.value = (origVal != null && origVal !== 0) ? String(origVal) : '';
      e.currentTarget.blur();
    } else {
      handleKeyDown(e, idx, col);
    }
  };

  const openPreview = (imageSrc: string) => {
    setPreviewImage(imageSrc);
  };

  // --- Undo helpers ---
  const pushUndo = (entry: { type: string, entries: { id: string, data: any }[], description: string }) => {
    setUndoStack(prev => [...prev.slice(-19), entry]);
    setRedoStack([]);
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));

    try {
      const batch = writeBatch(db);
      // redo용 현재 상태 저장
      const redoEntries: { id: string, data: any }[] = [];
      if (last.type === 'delete') {
        last.entries.forEach(e => {
          batch.set(doc(db, getCol('manualEntries', colPrefix), e.id), e.data);
          redoEntries.push({ id: e.id, data: {} });
        });
        setRedoStack(prev => [...prev, { type: 'add', entries: redoEntries, description: last.description }]);
      } else if (last.type === 'update') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          const currentData: any = {};
          Object.keys(e.data).forEach(k => { currentData[k] = current ? (current as any)[k] : ''; });
          redoEntries.push({ id: e.id, data: currentData });
          batch.update(doc(db, getCol('manualEntries', colPrefix), e.id), e.data);
        });
        setRedoStack(prev => [...prev, { type: 'update', entries: redoEntries, description: last.description }]);
      } else if (last.type === 'add') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          redoEntries.push({ id: e.id, data: current ? { ...current } : {} });
          batch.delete(doc(db, getCol('manualEntries', colPrefix), e.id));
        });
        setRedoStack(prev => [...prev, { type: 'delete', entries: redoEntries, description: last.description }]);
      }
      await batch.commit();
    } catch (e) {
      console.error('Undo error:', e);
      alert('실행취소 중 오류가 발생했습니다.');
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    try {
      const batch = writeBatch(db);
      const undoEntries: { id: string, data: any }[] = [];
      if (last.type === 'add') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          undoEntries.push({ id: e.id, data: current ? { ...current } : {} });
          batch.delete(doc(db, getCol('manualEntries', colPrefix), e.id));
        });
        setUndoStack(prev => [...prev, { type: 'delete', entries: undoEntries, description: last.description }]);
      } else if (last.type === 'update') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          const currentData: any = {};
          Object.keys(e.data).forEach(k => { currentData[k] = current ? (current as any)[k] : ''; });
          undoEntries.push({ id: e.id, data: currentData });
          batch.update(doc(db, getCol('manualEntries', colPrefix), e.id), e.data);
        });
        setUndoStack(prev => [...prev, { type: 'update', entries: undoEntries, description: last.description }]);
      } else if (last.type === 'delete') {
        last.entries.forEach(e => {
          batch.set(doc(db, getCol('manualEntries', colPrefix), e.id), e.data);
          undoEntries.push({ id: e.id, data: {} });
        });
        setUndoStack(prev => [...prev, { type: 'add', entries: undoEntries, description: last.description }]);
      }
      await batch.commit();
    } catch (e) {
      console.error('Redo error:', e);
      alert('다시실행 중 오류가 발생했습니다.');
    }
  };

  // --- Delete empty rows ---
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === '1234') {
      setIsAdminAuthenticated(true);
    } else {
      alert("비밀번호가 틀렸습니다.");
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewProduct({ ...newProduct, thumbnail: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleManualImageDrop = (id: string, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      updateProofInState(id, base64Image);
      setOcrLoadingIds(prev => new Set(prev).add(id));

      try {
        const { extractOrderInfo } = await import('./services/geminiService');
        const result = await extractOrderInfo(base64Image);
        console.log('[Drop OCR] 결과:', result);

        const updates: Partial<ManualEntry> = {};
        if (result.orderNumber) updates.orderNumber = result.orderNumber;
        if (result.receiverName) updates.name2 = result.receiverName;
        else if (result.ordererName) updates.name2 = result.ordererName;
        if (result.address) updates.address = result.address;
        if (result.phone) updates.emergencyContact = result.phone;

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), updates);
        }
      } catch (err) {
        console.error('[Drop OCR] 실패:', err);
      } finally {
        setOcrLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleManualImagePaste = (id: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Image = reader.result as string;
          updateProofInState(id, base64Image);
          setOcrLoadingIds(prev => new Set(prev).add(id));
          try {
            const { extractOrderInfo } = await import('./services/geminiService');
            const result = await extractOrderInfo(base64Image);
            console.log('[Paste OCR] 결과:', result);
            const updates: Partial<ManualEntry> = {};
            if (result.orderNumber) updates.orderNumber = result.orderNumber;
            if (result.receiverName) updates.name2 = result.receiverName;
            else if (result.ordererName) updates.name2 = result.ordererName;
            if (result.address) updates.address = result.address;
            if (result.phone) updates.emergencyContact = result.phone;
            if (Object.keys(updates).length > 0) {
              await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), updates);
            }
          } catch (err) {
            console.error('[Paste OCR] 실패:', err);
          } finally {
            setOcrLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  // Document-level paste listener (브라우저 호환성: td onPaste가 안 먹는 환경 대응)
  useEffect(() => {
    const handleDocPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return; // React onPaste에서 이미 처리됨
      if (!activePasteCellIdRef.current) return;
      const id: string = activePasteCellIdRef.current;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Image = reader.result as string;
            updateProofInState(id, base64Image);
            setOcrLoadingIds(prev => new Set(prev).add(id));
            try {
              const { extractOrderInfo } = await import('./services/geminiService');
              const result = await extractOrderInfo(base64Image);
              console.log('[DocPaste OCR] 결과:', result);
              const updates: Partial<ManualEntry> = {};
              if (result.orderNumber) updates.orderNumber = result.orderNumber;
              if (result.receiverName) updates.name2 = result.receiverName;
              else if (result.ordererName) updates.name2 = result.ordererName;
              if (result.address) updates.address = result.address;
              if (result.phone) updates.emergencyContact = result.phone;
              if (Object.keys(updates).length > 0) {
                await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), updates);
              }
            } catch (err) {
              console.error('[DocPaste OCR] 실패:', err);
            } finally {
              setOcrLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handleDocPaste);
    return () => document.removeEventListener('paste', handleDocPaste);
  }, []);

  const deleteSelectedManualEntries = async () => {
    if (selectedManualIds.size === 0) return;
    if (window.confirm(`${selectedManualIds.size}개의 항목을 삭제하시겠습니까?`)) {
      try {
        // Save for undo
        const toDelete = manualEntries.filter(e => selectedManualIds.has(e.id));
        pushUndo({
          type: 'delete',
          entries: toDelete.map(e => ({ id: e.id, data: { ...e } })),
          description: `${toDelete.length}개 항목 삭제`
        });

        const batch = writeBatch(db);
        selectedManualIds.forEach(id => {
          batch.delete(doc(db, getCol('manualEntries', colPrefix), id));
        });
        await batch.commit();
        setSelectedManualIds(new Set());
        alert("삭제되었습니다.");
      } catch (e) {
        console.error("Delete Error:", e);
        alert("삭제 중 오류가 발생했습니다: " + e);
      }
    }
  };

  const deleteEmptyRows = async () => {
    // 현재 화면에 보이는 행 중 빈행만 찾기
    const visible = manualEntries.filter(entry => {
      if (!entry) return false;
      if (manualViewDateStart !== 'all') {
        if (entry.date < manualViewDateStart || entry.date > manualViewDateEnd) return false;
      }
      if (debouncedManualSearch) {
        const queries = debouncedManualSearch.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const fields = [(entry.name1 || ''), (entry.name2 || ''), (entry.orderNumber || ''), (entry.product || ''), (entry.accountNumber || '')].map(f => f.toLowerCase());
        if (!queries.some(q => fields.some(f => f.includes(q)))) return false;
      }
      return true;
    });

    const emptyRows = visible.filter(e =>
      !e.product && !e.name1 && !e.name2 && !e.orderNumber && !e.address &&
      !e.memo && !e.accountNumber && !e.trackingNumber && !e.emergencyContact &&
      !e.proofImage && (e.paymentAmount || 0) === 0
    );

    if (emptyRows.length === 0) {
      alert('빈 행이 없습니다.');
      return;
    }
    if (!window.confirm(`현재 화면의 빈 행 ${emptyRows.length}개를 삭제하시겠습니까?`)) return;

    try {
      pushUndo({
        type: 'delete',
        entries: emptyRows.map(e => ({ id: e.id, data: { ...e } })),
        description: `빈 행 ${emptyRows.length}개 삭제`
      });

      const batch = writeBatch(db);
      emptyRows.forEach(e => batch.delete(doc(db, getCol('manualEntries', colPrefix), e.id)));
      await batch.commit();
      setSelectedManualIds(prev => {
        const next = new Set(prev);
        emptyRows.forEach(e => next.delete(e.id));
        return next;
      });
    } catch (err) {
      console.error('빈행 삭제 오류:', err);
      alert('삭제 중 오류: ' + err);
    }
  };

  const handleSort = (key: keyof ManualEntry) => {
    if (colResizedRef.current) return;
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // ✅ Deposit Management Robust Handlers
  const handleBulkDepositComplete = async () => {
    if (selectedDepositIds.size === 0) return;
    if (!window.confirm(`${selectedDepositIds.size}건을 입금완료 처리하시겠습니까?`)) return;

    try {
      const batch = writeBatch(db);
      selectedDepositIds.forEach(id => {
        batch.update(doc(db, getCol('manualEntries', colPrefix), id), { afterDeposit: true, depositDate: toLocalDateStr() });
      });
      await batch.commit();
      setSelectedDepositIds(new Set());
      alert("처리되었습니다.");
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const handleBulkDepositCancel = async () => {
    if (selectedDepositIds.size === 0) return;
    if (!window.confirm(`${selectedDepositIds.size}건의 입금완료를 취소하시겠습니까?`)) return;

    try {
      const batch = writeBatch(db);
      selectedDepositIds.forEach(id => {
        batch.update(doc(db, getCol('manualEntries', colPrefix), id), { afterDeposit: false });
      });
      await batch.commit();
      setSelectedDepositIds(new Set());
      alert("취소되었습니다.");
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const handleReservationComplete = async () => {
    if (selectedManualIds.size === 0) return;
    if (!window.confirm(`${selectedManualIds.size}건을 예약완료 처리하시겠습니까?`)) return;
    try {
      const batch = writeBatch(db);
      selectedManualIds.forEach(id => {
        batch.update(doc(db, getCol('manualEntries', colPrefix), id), { reservationComplete: true });
      });
      await batch.commit();
      setSelectedManualIds(new Set());
      alert("예약완료 처리되었습니다.");
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const handleReservationCancel = async () => {
    if (selectedManualIds.size === 0) return;
    if (!window.confirm(`${selectedManualIds.size}건의 예약완료를 취소하시겠습니까?`)) return;
    try {
      const batch = writeBatch(db);
      selectedManualIds.forEach(id => {
        batch.update(doc(db, getCol('manualEntries', colPrefix), id), { reservationComplete: false });
      });
      await batch.commit();
      setSelectedManualIds(new Set());
      alert("예약완료가 취소되었습니다.");
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const handleDepositRelease = async (id: string, type: 'before' | 'after') => {
    if (!window.confirm("해제하시겠습니까?")) return;
    try {
      const field = type === 'before' ? 'beforeDeposit' : 'afterDeposit';
      await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), { [field]: false });
    } catch (e) {
      console.error(e);
      alert("해제 중 오류가 발생했습니다: " + e);
    }
  };

  const handleDepositDelete = async (id: string) => {
    console.log("Attempting to delete document with ID:", id);
    if (!window.confirm("정말로 이 항목을 영구 삭제하시겠습니까? (복구 불가)")) return;
    try {
      console.log("Proceeding with deletion...");
      await deleteDoc(doc(db, getCol('manualEntries', colPrefix), id));
      console.log("Deletion successful");
      alert("삭제되었습니다.");
    } catch (e) {
      console.error("Delete Error:", e);
      alert("삭제 중 오류가 발생했습니다: " + e);
    }
  };

  const toggleBeforeDeposit = async (id: string, currentVal: boolean) => {
    try {
      const updates: Record<string, any> = {
        beforeDeposit: !currentVal,
        isManualCheck: !currentVal
      };

      if (!currentVal) {
        const entry = manualEntries.find(e => e.id === id);
        if (entry && !entry.paymentAmount) {
          const matchedPrice = productPrices.find(p => p.name === entry.product);
          if (matchedPrice) {
            updates.paymentAmount = matchedPrice.price;
          }
        }
      }

      await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), updates);
    } catch (e) {
      console.error("Toggle Error:", e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const toggleAfterDeposit = async (id: string, currentVal: boolean) => {
    try {
      await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), {
        afterDeposit: !currentVal
      });
    } catch (e) {
      console.error("Toggle Error:", e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const saveProduct = async () => {
    if (!newProduct.name) { alert("품목명을 입력해주세요."); return; }

    if (editingProductId) {
      await updateDoc(doc(db, getCol('products', colPrefix), editingProductId), {
        name: newProduct.name!,
        guideText: newProduct.guideText || '',
        refundAmount: newProduct.refundAmount || 0,
        totalQuota: newProduct.totalQuota || 0,
        remainingQuota: newProduct.totalQuota || 0,
        thumbnail: newProduct.thumbnail
      });
      setEditingProductId(null);
    } else {
      const product: Product = {
        id: Date.now().toString(),
        name: newProduct.name,
        guideText: newProduct.guideText || '',
        reviewGuideText: '',
        refundAmount: newProduct.refundAmount || 0,
        totalQuota: newProduct.totalQuota || 10,
        remainingQuota: newProduct.totalQuota || 10,
        thumbnail: newProduct.thumbnail,
      };
      await addDoc(collection(db, getCol('products', colPrefix)), product);
    }
    setNewProduct({ name: '', guideText: '', refundAmount: 0, totalQuota: 10, thumbnail: '' });
  };

  const deleteProduct = async (id: string) => {
    if (window.confirm("이 품목을 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, getCol('products', colPrefix), id));
    }
  };

  const addMoreRows = async (count: number) => {
    const dateToUse = manualViewDateStart !== 'all' ? manualViewDateEnd : toLocalDateStr();
    const newIds: string[] = [];
    const promises = Array.from({ length: count }).map(() => {
      const newRow = createEmptyRow(dateToUse);
      newIds.push(newRow.id);
      return setDoc(doc(db, getCol('manualEntries', colPrefix), newRow.id), newRow);
    });
    await Promise.all(promises);
    // Save for undo
    pushUndo({
      type: 'add',
      entries: newIds.map(id => ({ id, data: {} })),
      description: `${count}줄 추가`
    });
  };

  const insertRowAfterSelected = async () => {
    if (selectedManualIds.size === 0) {
      alert('행을 먼저 선택해주세요.');
      return;
    }

    try {
      const selectedEntries = manualEntries.filter(e => selectedManualIds.has(e.id));

      if (selectedEntries.length === 0) {
        alert('선택된 항목을 찾을 수 없습니다.');
        return;
      }

      // 정렬: date 내림차순, 같은 date면 createdAt 오름차순
      // 따라서 "화면상 가장 아래" = date가 가장 작거나, 같은 date면 createdAt이 가장 큼
      const lastSelected = selectedEntries.reduce((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) {
          // date가 다름: 작은 date가 아래 (내림차순이므로)
          return dateCmp > 0 ? a : b;  // b.date > a.date이면 a가 아래
        }
        // date 같음: 큰 createdAt이 아래 (오름차순이므로)
        return (a.createdAt || 0) > (b.createdAt || 0) ? a : b;
      });

      // 선택한 행의 바로 아래에 삽입하려면:
      // - 같은 date 사용
      // - createdAt을 선택한 행보다 크게 설정 (오름차순이므로 아래로 감)
      const newRow = createEmptyRow(lastSelected.date);
      newRow.createdAt = (lastSelected.createdAt || Date.now()) + 1;

      await setDoc(doc(db, getCol('manualEntries', colPrefix), newRow.id), newRow);

      pushUndo({
        type: 'add',
        entries: [{ id: newRow.id, data: {} }],
        description: '행 삽입'
      });

      // 선택 해제
      setSelectedManualIds(new Set());
    } catch (error) {
      console.error('행 삽입 오류:', error);
      alert('행 삽입 중 오류가 발생했습니다: ' + error);
    }
  };

  const updateManualEntry = async (id: string, field: keyof ManualEntry, value: any) => {
    const entry = manualEntries.find(e => e.id === id);
    if (!entry) return;

    // proofImage는 localStorage에만 저장
    if (field === 'proofImage') {
      pushUndo({ type: 'update', entries: [{ id, data: { proofImage: entry.proofImage } }], description: 'proofImage 수정' });
      updateProofInState(id, value);
      return;
    }

    const updates: Partial<ManualEntry> = { [field]: value };

    // Undo: Save previous value
    pushUndo({
      type: 'update',
      entries: [{ id: entry.id, data: { [field]: entry[field] } }],
      description: `${field} 수정`
    });

    // Auto-calculate Payment Amount
    if (field === 'product' || field === 'orderNumber' || field === 'couponApplied') {
      const productName = field === 'product' ? value : entry.product;
      const matchedPrice = productPrices.find(p => p.name === productName);

      if (matchedPrice) {
        const isCoupon = field === 'couponApplied' ? (value as boolean) : entry.couponApplied !== false;
        const basePrice = isCoupon ? matchedPrice.price : (matchedPrice.priceNoCoupon || matchedPrice.price);
        let finalPrice = basePrice;
        const orderNum = field === 'orderNumber' ? value : entry.orderNumber;
        if ((orderNum || '').includes('실배')) {
          finalPrice -= 1000;
        }
        updates.paymentAmount = finalPrice;
      }
    }

    await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), updates);
  };

  const handleManualImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      updateProofInState(id, base64Image);
      setOcrLoadingIds(prev => new Set(prev).add(id));

      try {
        const { extractOrderInfo } = await import('./services/geminiService');
        const result = await extractOrderInfo(base64Image);
        console.log('[Upload OCR] 결과:', result);

        const ocrUpdates: Partial<ManualEntry> = {};
        if (result.orderNumber) ocrUpdates.orderNumber = result.orderNumber;
        if (result.receiverName) ocrUpdates.name2 = result.receiverName;
        else if (result.ordererName) ocrUpdates.name2 = result.ordererName;
        if (result.address) ocrUpdates.address = result.address;
        if (result.phone) ocrUpdates.emergencyContact = result.phone;

        if (Object.keys(ocrUpdates).length > 0) {
          await updateDoc(doc(db, getCol('manualEntries', colPrefix), id), ocrUpdates);
        }
      } catch (err) {
        console.error('[Upload OCR] 실패:', err);
      } finally {
        setOcrLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    };
    reader.readAsDataURL(file);
  };

  const multiImageInputRef = useRef<HTMLInputElement>(null);
  const activePasteCellIdRef = useRef<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const handleMultiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 현재 보이는 행 중 proofImage 없는 행 찾기 (순서대로)
    const dateStart = manualViewDateStart;
    const dateEnd = manualViewDateEnd;
    let available = manualEntries.filter(entry => {
      if (!entry) return false;
      if (!entry.proofImage) {
        if (dateStart !== 'all') {
          if (entry.date < dateStart || entry.date > dateEnd) return false;
        }
        return true;
      }
      return false;
    });

    const fileArr: File[] = Array.from(files);

    // 빈 행이 부족하면 추가 생성
    if (available.length < fileArr.length) {
      const needed = fileArr.length - available.length;
      const dateToUse = dateStart !== 'all' ? dateStart : toLocalDateStr();
      const newIds: string[] = [];
      const promises = Array.from({ length: needed }).map(() => {
        const newRow = createEmptyRow(dateToUse);
        newIds.push(newRow.id);
        return setDoc(doc(db, getCol('manualEntries', colPrefix), newRow.id), newRow);
      });
      await Promise.all(promises);
      // 새로 만든 행 추가
      const newEntries = newIds.map(id => createEmptyRow(dateToUse)).map((row, i) => ({ ...row, id: newIds[i] }));
      available = [...available, ...newEntries];
    }

    // 각 파일을 빈 행에 순차 할당 (동시 OCR 방지)
    const readFileAsDataURL = (file: File): Promise<string> => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    // 파일 input 초기화 (같은 파일 재선택 가능)
    e.target.value = '';

    const { extractOrderInfo } = await import('./services/geminiService');
    for (let i = 0; i < fileArr.length && i < available.length; i++) {
      const targetEntry = available[i];
      const base64Image = await readFileAsDataURL(fileArr[i]);
      updateProofInState(targetEntry.id, base64Image);
      setOcrLoadingIds(prev => new Set(prev).add(targetEntry.id));

      try {
        const result = await extractOrderInfo(base64Image);
        console.log(`[Multi OCR ${i + 1}/${fileArr.length}] 결과:`, result);

        const ocrUpdates: Partial<ManualEntry> = {};
        if (result.orderNumber) ocrUpdates.orderNumber = result.orderNumber;
        if (result.receiverName) ocrUpdates.name2 = result.receiverName;
        else if (result.ordererName) ocrUpdates.name2 = result.ordererName;
        if (result.address) ocrUpdates.address = result.address;
        if (result.phone) ocrUpdates.emergencyContact = result.phone;

        if (Object.keys(ocrUpdates).length > 0) {
          await updateDoc(doc(db, getCol('manualEntries', colPrefix), targetEntry.id), ocrUpdates);
        }
      } catch (err) {
        console.error(`[Multi OCR ${i + 1}] 실패:`, err);
      } finally {
        setOcrLoadingIds(prev => { const s = new Set(prev); s.delete(targetEntry.id); return s; });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.nativeEvent.isComposing) return;

    let targetRow = rowIdx;
    let targetCol = colIdx;
    if (e.key === 'ArrowUp') targetRow--;
    else if (e.key === 'ArrowDown') targetRow++;
    else if (e.key === 'ArrowLeft') targetCol--;
    else if (e.key === 'ArrowRight') targetCol++;
    else return;

    e.preventDefault();
    const nextInput = document.querySelector(`input[data-row="${targetRow}"][data-col="${targetCol}"]`) as HTMLInputElement;
    if (nextInput) {
      nextInput.focus();
    }
  };

  const handleCellPaste = (e: React.ClipboardEvent, startRowIdx: number, startColIdx: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const rows = text.split(/\r?\n/).filter(r => r.length > 0);
    if (rows.length === 0) return;

    const cells = rows.map(r => r.split('\t'));

    // 여러 셀 데이터가 있으면 셀 단위 붙여넣기
    if (cells.length > 1 || cells[0].length > 1) {
      e.preventDefault();
      for (let r = 0; r < cells.length; r++) {
        for (let c = 0; c < cells[r].length; c++) {
          const targetRow = startRowIdx + r;
          const targetCol = startColIdx + c;
          const input = document.querySelector(`input[data-row="${targetRow}"][data-col="${targetCol}"]`) as HTMLInputElement;
          if (input) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(input, cells[r][c].trim());
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }
      }
    }
    // 단일 셀이면 기본 붙여넣기 동작 유지
  };

  // Cell drag selection helpers
  const isCellSelected = (row: number, col: number) => {
    if (!cellSelection) return false;
    const minR = Math.min(cellSelection.startRow, cellSelection.endRow);
    const maxR = Math.max(cellSelection.startRow, cellSelection.endRow);
    const minC = Math.min(cellSelection.startCol, cellSelection.endCol);
    const maxC = Math.max(cellSelection.startCol, cellSelection.endCol);
    return row >= minR && row <= maxR && col >= minC && col <= maxC;
  };

  const handleCellMouseDown = (row: number, col: number) => {
    cellDragRef.current = { row, col, active: true };
    setCellSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!cellDragRef.current.active) return;
    const { row: startRow, col: startCol } = cellDragRef.current;
    // 드래그 시작 → 입력 포커스 해제, 선택 범위 표시
    (document.activeElement as HTMLElement)?.blur();
    setCellSelection({ startRow, startCol, endRow: row, endCol: col });
  };

  const handleCellMouseUp = () => {
    cellDragRef.current.active = false;
  };

  // Ctrl+C / Cmd+C: 선택된 셀 복사
  const cellSelectionRef = useRef(cellSelection);
  cellSelectionRef.current = cellSelection;
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const sel = cellSelectionRef.current;
      if (!sel) return;
      const isMultiCell = sel.startRow !== sel.endRow || sel.startCol !== sel.endCol;
      if (!isMultiCell) return; // 단일 셀은 기본 복사

      e.preventDefault();
      const minR = Math.min(sel.startRow, sel.endRow);
      const maxR = Math.max(sel.startRow, sel.endRow);
      const minC = Math.min(sel.startCol, sel.endCol);
      const maxC = Math.max(sel.startCol, sel.endCol);

      const rows: string[] = [];
      for (let r = minR; r <= maxR; r++) {
        const cols: string[] = [];
        for (let c = minC; c <= maxC; c++) {
          const input = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`) as HTMLInputElement;
          cols.push(input?.value || '');
        }
        rows.push(cols.join('\t'));
      }
      e.clipboardData?.setData('text/plain', rows.join('\n'));
    };
    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, []);

  const downloadBeforeDepositCsv = async () => {
    const beforeItems = manualEntries.filter(e => e.beforeDeposit && !e.afterDeposit);
    if (beforeItems.length === 0) return alert("다운로드할 데이터가 없습니다.");

    const XLSX = await import('xlsx');
    const chunkSize = 15;
    const today = toLocalDateStr();

    // 은행명 (긴 이름 우선 매칭)
    const BANKS = ['카카오뱅크','토스뱅크','케이뱅크','우리은행','SC제일','새마을','우체국','농협','국민','신한','하나','우리','기업','수협','신협','대구','부산','경남','광주','전북','제주','IBK','KB','NH'];
    const parseAccount = (raw: string): [string, string, string] => {
      if (!raw || !raw.trim()) return ['', '', ''];
      const str = raw.trim();
      // 은행명 찾기
      let bank = '';
      for (const b of BANKS) {
        if (str.includes(b)) { bank = b; break; }
      }
      // 계좌번호: 숫자+하이픈+공백 연속 구간만 추출
      const m = str.match(/\d[\d\-\s]*\d|\d+/);
      const account = m ? m[0].trim() : '';
      // 이름: 은행명, 계좌번호, 은행관련 키워드 모두 제거한 나머지 한글
      let remaining = str;
      if (bank) remaining = remaining.replace(bank, '');
      if (account) remaining = remaining.replace(account, '');
      remaining = remaining.replace(/[\d\-\s]/g, '');
      // 잔여 은행 관련 키워드 제거
      const BANK_WORDS = ['카카오뱅크','토스뱅크','케이뱅크','우리은행','SC제일은행','새마을금고','우체국','카카오','토스','은행','뱅크','금고','NH','IBK','KB','SC'];
      for (const w of BANK_WORDS) {
        remaining = remaining.split(w).join('');
      }
      const name = remaining.trim();
      return [bank, account, name];
    };

    const allRows = beforeItems.map(e => {
      const [bank, account, accountName] = parseAccount(e.accountNumber);
      return [bank, account, e.paymentAmount || '', accountName || e.name1 || e.name2, `${bizInfo?.name || ''}환불`];
    });

    // 15개씩 분할 다운로드
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const ws = XLSX.utils.aoa_to_sheet(chunk);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '환불입금');
      const fileIndex = (i / chunkSize) + 1;
      XLSX.writeFile(wb, `${today} 환불입금내역_${fileIndex}.xlsx`);
    }

    // 통합본 다운로드
    const wsAll = XLSX.utils.aoa_to_sheet(allRows);
    const wbAll = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbAll, wsAll, '환불입금');
    XLSX.writeFile(wbAll, `${today} 환불입금내역_통합.xlsx`);
  };

  const downloadManualCsv = () => {
    const entriesToExport = selectedManualIds.size > 0
      ? manualEntries.filter(e => selectedManualIds.has(e.id))
      : manualEntries.filter(e => e.product || e.name1 || e.ordererName);
    if (entriesToExport.length === 0) return alert("다운로드할 데이터가 없습니다.");
    const headers = ["구매인증샷", "갯수", "품목", "날짜", "이름1", "이름2/주문자명", "주문번호", "주소", "비고", "결제금액", "계좌번호", "입금전", "입금후"];
    const rows = entriesToExport.map(e => [
      "IMAGE_DATA", e.count, `"${e.product}"`, e.date, `"${e.name1}"`, `"${e.name2}/${e.ordererName}"`, `"${e.orderNumber}"`, `"${e.address}"`, `"${e.memo}"`, e.paymentAmount, `"${e.accountNumber}"`, e.beforeDeposit ? "O" : "X", e.afterDeposit ? "O" : "X"
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Mission_Export_${toLocalDateStr()}.csv`;
    link.click();
  };

  const handleApplyFinalSubmit = async () => {
    if (!selectedProductId || !customerForm.proofImage || !customerForm.kakaoNick || !customerForm.phoneNumber) {
      alert("정보를 모두 입력해주세요."); return;
    }
    setIsSubmitting(true);

    try {
      const selectedProduct = products.find(p => p.id === selectedProductId);
      const newEntry: ManualEntry = {
        ...createEmptyRow(),
        proofImage: customerForm.proofImage,
        product: selectedProduct?.name || '',
        name1: customerForm.kakaoNick,
        emergencyContact: customerForm.phoneNumber,
        date: toLocalDateStr(),
        paymentAmount: selectedProduct?.price || 0,
      };

      const priceObj = productPrices.find(p => p.name === newEntry.product);
      if (priceObj) newEntry.paymentAmount = priceObj.price;

      await addDoc(collection(db, getCol('manualEntries', colPrefix)), newEntry);

      setLastSubmittedType('apply');
      setIsSubmitting(false);
      setShowSuccess(true);
    } catch (e) {
      console.error("Submit Error", e);
      alert("제출 중 오류가 발생했습니다.");
      setIsSubmitting(false);
    }
  };

  const handleDirectReviewUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!customerForm.orderNumber?.trim()) {
      alert("환급액 누락 방지를 위해 계좌정보를 꼭 입력해주세요.");
      e.target.value = '';
      return;
    }

    setIsSubmitting(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64Image = reader.result as string;

      setLastSubmittedType('review');
      setIsSubmitting(false);
      setShowSuccess(true);

      try {
        const { extractOrderInfo } = await import('./services/geminiService');
        const { orderNumber: extractedOrderNumber, ordererName } = await extractOrderInfo(base64Image);

        const reviewEntry: ReviewEntry = {
          id: Math.random().toString(36).substr(2, 9),
          image: base64Image,
          orderNumber: extractedOrderNumber || '',
          ordererName: ordererName || '',
          bankInfo: customerForm.orderNumber || '',
          date: toLocalDateStr(),
        };
        await addDoc(collection(db, getCol('reviewEntries', colPrefix)), reviewEntry);

        if (extractedOrderNumber) {
          const matchedEntry = manualEntries.find(entry => entry.orderNumber === extractedOrderNumber);
          if (matchedEntry) {
            await updateDoc(doc(db, getCol('manualEntries', colPrefix), matchedEntry.id), { beforeDeposit: true });
            console.log(`[OCR 매칭 성공] 주문번호 [${extractedOrderNumber}] → 입금 대기 상태로 변경`);
          } else {
            console.log(`[OCR 매칭 실패] 주문번호 [${extractedOrderNumber}] → 매칭되는 주문 내역 없음`);
          }
        } else {
          console.log("[OCR] 이미지에서 주문번호를 인식하지 못함");
        }
      } catch (error) {
        console.error("[OCR] 분석 중 오류 발생:", error);
      }
    };
  };

  const resetCustomerFlow = () => {
    setShowSuccess(false);
    setCustomerView('landing');
    setSelectedProductId(null);
    setCustomerForm({ kakaoNick: '', phoneNumber: '', proofImage: '', orderNumber: '' });
  };

  // 사업자 전환 시 UI state 초기화
  useEffect(() => {
    setSelectedManualIds(new Set());
    setSelectedDepositIds(new Set());
    setSelectedReviewIds(new Set());
    setSelectedProductId(null);
    setCustomerForm({ kakaoNick: '', phoneNumber: '', proofImage: '', orderNumber: '' });
    setShowSuccess(false);
    setCustomerView('landing');
    setSalesUndoStack([]);
    setSalesRedoStack([]);
    setPendingUpload(null);
    setLastUploadInfo(null);
    setColorPicker(null);
    setUndoStack([]);
    setRedoStack([]);
  }, [selectedBiz]);

  const renderDatePicker = (
    selected: string, onSelect: (d: string) => void,
    isOpen: boolean, setOpen: (b: boolean) => void,
    viewMonth: Date, setViewMonth: (d: Date) => void,
    dateCounts: Record<string, number>
  ) => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    const todayStr = toLocalDateStr();
    return (
      <div className="relative inline-block">
        <div className="flex gap-2 items-center">
          <button onClick={() => setOpen(!isOpen)} className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold hover:border-blue-500 transition-all">
            <span>📅</span>
            <span>{selected === 'all' ? '전체' : selected}</span>
            <span className="text-gray-300 text-[10px]">▼</span>
          </button>
          {selected !== 'all' && (
            <button onClick={() => onSelect('all')} className="px-3 py-1.5 bg-gray-100 rounded-xl text-[10px] font-black text-gray-500 hover:bg-gray-200">전체</button>
          )}
        </div>
        {isOpen && (<>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 w-64">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setViewMonth(new Date(year, month - 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 font-bold text-xs">◀</button>
              <span className="font-black text-xs">{year}년 {month + 1}월</span>
              <button onClick={() => setViewMonth(new Date(year, month + 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 font-bold text-xs">▶</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-gray-400 mb-1">
              {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const count = dateCounts[dateStr] || 0;
                const isSelected = dateStr === selected;
                const isToday = dateStr === todayStr;
                return (
                  <button key={i} onClick={() => { onSelect(dateStr); setOpen(false); }}
                    className={`relative p-1.5 rounded-lg text-[11px] font-bold transition-all ${isSelected ? 'bg-blue-600 text-white' :
                      isToday ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300' :
                        count > 0 ? 'hover:bg-gray-100 text-gray-800' : 'text-gray-300'
                      }`}>
                    {day}
                    {count > 0 && !isSelected && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t flex justify-between">
              <button onClick={() => { onSelect(todayStr); setOpen(false); setViewMonth(new Date()); }} className="text-[10px] font-black text-blue-600 hover:underline">오늘</button>
              <button onClick={() => { onSelect('all'); setOpen(false); }} className="text-[10px] font-black text-gray-500 hover:underline">전체 보기</button>
            </div>
          </div>
        </>)}
      </div>
    );
  };

  const manualRangeStepRef = useRef<'start' | 'end'>('start');
  // Cursor guide state
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursorGuide, setShowCursorGuide] = useState(false);

  const renderDateRangePicker = (
    startDate: string, endDate: string,
    onSelectStart: (d: string) => void, onSelectEnd: (d: string) => void,
    isOpen: boolean, setOpen: (b: boolean) => void,
    viewMonth: Date, setViewMonth: (d: Date) => void,
    dateCounts: Record<string, number>
  ) => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    const todayStr = toLocalDateStr();
    const isAll = startDate === 'all';
    const displayText = isAll ? '전체' : (startDate === endDate ? startDate : `${startDate} ~ ${endDate}`);



    return (
      <div className="relative inline-block">
        <div className="flex gap-2 items-center">
          <button onClick={() => setOpen(!isOpen)} className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold hover:border-blue-500 transition-all">
            <span>📅</span>
            <span>{displayText}</span>
            <span className="text-gray-300 text-[10px]">▼</span>
          </button>
          {!isAll && (
            <button onClick={() => { onSelectStart('all'); onSelectEnd('all'); }} className="px-3 py-1.5 bg-gray-100 rounded-xl text-[10px] font-black text-gray-500 hover:bg-gray-200">전체</button>
          )}
        </div>
        {isOpen && (<>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 w-64"
            onMouseMove={(e) => {
              setCursorPos({ x: e.clientX, y: e.clientY });
              setShowCursorGuide(true);
            }}
            onMouseLeave={() => setShowCursorGuide(false)}
          >
            {showCursorGuide && (
              <div
                className={`fixed pointer-events-none px-3 py-1.5 rounded-full text-xs font-black text-white shadow-lg border-2 border-white z-[60] transition-transform duration-75 ${manualRangeStepRef.current === 'start' ? 'bg-blue-600' : 'bg-red-500'}`}
                style={{ left: cursorPos.x + 15, top: cursorPos.y + 15 }}
              >
                {manualRangeStepRef.current === 'start' ? '시작일 선택' : '종료일 선택'}
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setViewMonth(new Date(year, month - 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 font-bold text-xs">◀</button>
              <span className="font-black text-xs">{year}년 {month + 1}월</span>
              <button onClick={() => setViewMonth(new Date(year, month + 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 font-bold text-xs">▶</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-gray-400 mb-1">
              {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const count = dateCounts[dateStr] || 0;
                const isStart = dateStr === startDate;
                const isEnd = dateStr === endDate;
                const inRange = !isAll && startDate !== 'all' && dateStr >= startDate && dateStr <= endDate;
                const isToday = dateStr === todayStr;
                return (
                  <button key={i} onClick={() => {
                    if (manualRangeStepRef.current === 'start') {
                      onSelectStart(dateStr);
                      onSelectEnd(dateStr);
                      manualRangeStepRef.current = 'end';
                    } else {
                      let s = startDate, e = dateStr;
                      if (e < s) { [s, e] = [e, s]; }
                      onSelectStart(s);
                      onSelectEnd(e);
                      manualRangeStepRef.current = 'start';
                      setOpen(false);
                    }
                  }}
                    className={`relative p-1.5 rounded-lg text-[11px] font-bold transition-all ${isStart || isEnd ? 'bg-blue-600 text-white' :
                      inRange ? 'bg-blue-100 text-blue-700' :
                        isToday ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-300' :
                          count > 0 ? 'hover:bg-gray-100 text-gray-800' : 'text-gray-300'
                      }`}>
                    {day}
                    {count > 0 && !isStart && !isEnd && !inRange && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t flex justify-between">
              <button onClick={() => { const t = todayStr; onSelectStart(t); onSelectEnd(t); manualRangeStepRef.current = 'start'; setOpen(false); setViewMonth(new Date()); }} className="text-[10px] font-black text-blue-600 hover:underline">오늘</button>
              <button onClick={() => { onSelectStart('all'); onSelectEnd('all'); manualRangeStepRef.current = 'start'; setOpen(false); }} className="text-[10px] font-black text-gray-500 hover:underline">전체 보기</button>
            </div>
          </div>
        </>)}
      </div>
    );
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className={`min-h-screen font-sans text-[#1D1D1F] antialiased ${selectedBiz === 'zoe' ? 'bg-[#FFF0F3]' : selectedBiz === 'angun' ? 'bg-[#EFF6FF]' : 'bg-[#FBFBFD]'}`}>
      {/* Lightbox Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg shadow-2xl" alt="Preview" />
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-2xl font-bold transition-colors">&times;</button>
        </div>
      )}

      {/* Nav */}
      <nav className={`border-b sticky top-0 z-50 ${selectedBiz === 'zoe' ? 'bg-[#FFF0F3] border-pink-200' : selectedBiz === 'angun' ? 'bg-[#EFF6FF] border-blue-200' : 'bg-white border-gray-100'}`}>
        <div className="max-w-[1500px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={resetCustomerFlow}>
            <div className="w-8 h-8 bg-[#0071E3] rounded-lg flex items-center justify-center text-white font-black">M</div>
            <span className="font-bold text-xl tracking-tight uppercase">Mission Hub</span>
          </div>
          <div className="flex items-center gap-3">
            {mode === 'admin' && isAdminAuthenticated && selectedBiz && (
              <div className="flex bg-white/80 p-1 rounded-xl border border-gray-200">
                {Object.values(BUSINESSES).map(biz => (
                  <button key={biz.id} onClick={() => setSelectedBiz(biz.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedBiz === biz.id
                        ? biz.id === 'zoe' ? 'bg-pink-500 text-white shadow-sm' : 'bg-blue-500 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}>{biz.name}</button>
                ))}
              </div>
            )}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setMode('customer')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'customer' ? 'bg-white shadow-sm text-[#0071E3]' : 'text-gray-500'}`}>체험단</button>
              <button onClick={() => setMode('admin')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'admin' ? 'bg-white shadow-sm text-[#0071E3]' : 'text-gray-500'}`}>관리자</button>
            </div>
          </div>
        </div>
        {selectedBiz && mode === 'admin' && isAdminAuthenticated && (
          <div className={`text-center py-1.5 text-sm font-black ${selectedBiz === 'zoe' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
            여기는 {bizInfo?.name}입니다
          </div>
        )}
      </nav>

      <main className={`${mode === 'admin' && adminTab === 'manual' ? 'max-w-full px-4' : 'max-w-5xl'} mx-auto p-6 md:p-12`}>
        {mode === 'admin' ? (
          !isAdminAuthenticated ? (
            <div className="flex items-center justify-center pt-20">
              <div className="bg-white p-10 rounded-[32px] shadow-xl border border-gray-100 w-full max-w-sm space-y-8 text-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Admin Dashboard</h2>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <input type="password" placeholder="비밀번호" className="w-full p-4 bg-gray-50 rounded-xl font-bold border-2 border-transparent focus:border-blue-600 outline-none transition-all" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
                  <button type="submit" className="w-full py-4 bg-[#0071E3] text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700">접속하기</button>
                </form>
              </div>
            </div>
          ) : !selectedBiz ? (
            <div className="flex items-center justify-center pt-20">
              <div className="bg-white p-10 rounded-[32px] shadow-xl border border-gray-100 w-full max-w-md space-y-8 text-center">
                <h2 className="text-2xl font-black tracking-tighter">사업장 선택</h2>
                <div className="grid grid-cols-1 gap-4">
                  {Object.values(BUSINESSES).map(biz => (
                    <button key={biz.id} onClick={() => setSelectedBiz(biz.id)}
                      className="p-6 bg-gray-50 rounded-2xl hover:bg-blue-50 hover:border-blue-500 border-2 border-transparent transition-all text-left">
                      <h3 className="text-xl font-black">{biz.name}</h3>
                      {biz.phone && <p className="text-sm text-gray-400 mt-1">{biz.phone}</p>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-3 px-1">
                {([
                  { key: 'dashboard', label: '설정', icon: '~', color: 'blue' },
                  { key: 'manual', label: '구매', icon: '~', color: 'blue' },
                  { key: 'reviewComplete', label: '후기', icon: '~', color: 'orange' },
                  { key: 'productPrices', label: '품목', icon: '~', color: 'blue' },
                  { key: 'deposit', label: '입금', icon: '~', color: 'blue' },
                  { key: 'sales', label: '매출', icon: '~', color: 'green' },
                ] as { key: typeof adminTab; label: string; icon: string; color: string }[]).map(tab => (
                  <button key={tab.key} onClick={() => setAdminTab(tab.key)}
                    className={`flex-shrink-0 px-4 py-2 rounded-2xl text-xs font-black transition-all ${
                      adminTab === tab.key
                        ? tab.color === 'orange' ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                        : tab.color === 'green' ? 'bg-green-600 text-white shadow-md shadow-green-200'
                        : 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >{tab.label}</button>
                ))}
              </div>

              {adminTab === 'dashboard' ? (
                <div className="space-y-10 animate-in fade-in duration-500">
                  <section className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                    <h2 className="text-xl font-black text-gray-900">환경 설정</h2>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                      <div className="space-y-1">
                        <h3 className="font-bold">메인화면 '신청하기' 버튼 노출</h3>
                        <p className="text-xs text-gray-400">활성화시 메인화면에 신청하기 버튼이 표시됩니다.</p>
                      </div>
                      <div
                        onClick={() => updateSettings({ ...settings, isApplyActive: !settings.isApplyActive })}
                        className={`relative w-14 h-8 rounded-full transition-colors cursor-pointer ${settings.isApplyActive ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform shadow-sm ${settings.isApplyActive ? 'translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </section>
                  <section className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-8">
                    <h2 className="text-xl font-black text-gray-900">미션 등록/편집</h2>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                      <div className="md:col-span-4">
                        <input type="file" id="thumb-admin" className="hidden" onChange={handleThumbnailChange} />
                        <label htmlFor="thumb-admin" className="block aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer overflow-hidden">
                          {newProduct.thumbnail ? <img src={newProduct.thumbnail} className="w-full h-full object-cover" /> : <div className="text-center text-gray-400 font-black text-[10px] uppercase">📸 사진 업로드</div>}
                        </label>
                      </div>
                      <div className="md:col-span-8 space-y-5">
                        <input type="text" placeholder="품목명" className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-500" value={newProduct.name || ''} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
                        <div className="grid grid-cols-2 gap-4">
                          <input type="number" placeholder="환급액" className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none" value={newProduct.refundAmount || ''} onChange={e => setNewProduct({ ...newProduct, refundAmount: Number(e.target.value) })} />
                          <input type="number" placeholder="수량" className="w-full p-4 bg-gray-50 rounded-xl font-bold outline-none" value={newProduct.totalQuota || ''} onChange={e => setNewProduct({ ...newProduct, totalQuota: Number(e.target.value) })} />
                        </div>
                        <textarea placeholder="신청 가이드" className="w-full p-4 bg-gray-50 rounded-xl font-bold h-24 outline-none border-2 border-transparent focus:border-blue-500 resize-none text-xs" value={newProduct.guideText || ''} onChange={e => setNewProduct({ ...newProduct, guideText: e.target.value })} />
                        <button onClick={saveProduct} className="w-full py-4 bg-[#0071E3] text-white rounded-xl font-black">{editingProductId ? '편집 저장' : '등록하기'}</button>
                      </div>
                    </div>
                  </section>
                  <section className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                    <h3 className="text-xl font-black">미션 리스트</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {products.map(p => (
                        <div key={p.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <img src={p.thumbnail} className="w-16 h-16 rounded-xl object-cover" />
                          <div className="flex-1">
                            <h4 className="font-black text-sm">{p.name}</h4>
                            <p className="text-[10px] text-gray-400 font-bold">{p.refundAmount.toLocaleString()}원 | 잔여 {p.remainingQuota}/{p.totalQuota}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingProductId(p.id); setNewProduct(p); }} className="px-3 py-1.5 bg-blue-100 text-blue-600 rounded-lg text-[10px] font-black uppercase">Edit</button>
                            <button onClick={() => deleteProduct(p.id)} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase">Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : adminTab === 'reviewComplete' ? (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl overflow-hidden animate-in slide-in-from-right-10 duration-500">
                  <div className="flex justify-between items-center bg-white border-b sticky left-0 z-30 p-6">
                    <h2 className="text-xl font-black text-gray-900">후기 인증 완료 목록 ({reviewEntries.length}건)</h2>
                    {selectedReviewIds.size > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (window.confirm(`${selectedReviewIds.size}건의 후기 인증 내역을 삭제하시겠습니까?`)) {
                              const promises = Array.from(selectedReviewIds).map((id: string) => deleteDoc(doc(db, getCol('reviewEntries', colPrefix), id)));
                              await Promise.all(promises);
                              setSelectedReviewIds(new Set());
                            }
                          }}
                          className="px-4 py-2 bg-red-100 text-red-600 rounded-xl text-xs font-black hover:bg-red-200 transition-all"
                        >
                          삭제 ({selectedReviewIds.size})
                        </button>
                        <button
                          onClick={async () => {
                            const selectedReviews = reviewEntries.filter(e => selectedReviewIds.has(e.id));
                            if (selectedReviews.length === 0) return;

                            const targetOrderNumbers = new Set(selectedReviews.map(e => (e.orderNumber || '').trim()).filter(Boolean));

                            const hasMatch = manualEntries.some(e => targetOrderNumbers.has((e.orderNumber || '').trim()));

                            if (!hasMatch) {
                              alert("일치하는 주문번호가 없습니다.");
                              return;
                            }

                            const promises = manualEntries
                              .filter(e => targetOrderNumbers.has((e.orderNumber || '').trim()))
                              .map(e => updateDoc(doc(db, getCol('manualEntries', colPrefix), e.id), { beforeDeposit: true, afterDeposit: false }));

                            await Promise.all(promises);
                            setSelectedReviewIds(new Set());
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-black hover:bg-green-700 transition-all"
                        >
                          입금전으로 발송 ({selectedReviewIds.size})
                        </button>
                      </div>
                    )}
                  </div>
                  {reviewEntries.length === 0 ? (
                    <div className="p-16 text-center text-gray-300">
                      <span className="text-6xl block mb-4">⭐</span>
                      <p className="font-bold">아직 제출된 후기 인증이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto" onMouseUp={() => { isDraggingRef.current = false; }} onMouseLeave={() => { isDraggingRef.current = false; }}>
                      <table className="w-full text-center">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase">
                          <tr>
                            <th className="p-2 w-10">
                              <input type="checkbox" className="w-4 h-4 accent-blue-600"
                                checked={reviewEntries.length > 0 && selectedReviewIds.size === reviewEntries.length}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedReviewIds(new Set(reviewEntries.map(e => e.id)));
                                  else setSelectedReviewIds(new Set());
                                }}
                              />
                            </th>
                            <th className="p-2 w-10">No.</th>
                            <th className="p-2 w-24">인증 이미지</th>
                            <th className="p-2">주문번호</th>
                            <th className="p-2">주문자명</th>
                            <th className="p-2">은행명</th>
                            <th className="p-2">계좌번호</th>
                            <th className="p-2">이름</th>
                            <th className="p-2">제출일</th>
                          </tr>
                        </thead>
                        <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                          {reviewEntries.map((entry, idx) => (
                            <tr key={entry.id}
                              className={`hover:bg-orange-50/30 transition-colors cursor-default ${selectedReviewIds.has(entry.id) ? 'bg-blue-50' : ''}`}
                              onMouseDown={(e) => {
                                if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'IMG') return;
                                isDraggingRef.current = true;
                                dragStartIndexRef.current = idx;
                                const next = new Set(selectedReviewIds);
                                if (!e.shiftKey) next.clear();
                                next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                setSelectedReviewIds(next);
                              }}
                              onMouseEnter={() => {
                                if (!isDraggingRef.current) return;
                                const start = Math.min(dragStartIndexRef.current, idx);
                                const end = Math.max(dragStartIndexRef.current, idx);
                                const next = new Set<string>();
                                for (let i = start; i <= end; i++) {
                                  if (reviewEntries[i]) next.add(reviewEntries[i].id);
                                }
                                setSelectedReviewIds(next);
                              }}
                            >
                              <td className="p-1">
                                <input type="checkbox" className="w-3 h-3 accent-blue-600"
                                  checked={selectedReviewIds.has(entry.id)}
                                  onChange={() => {
                                    const next = new Set(selectedReviewIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedReviewIds(next);
                                  }}
                                />
                              </td>
                              <td className="p-1 text-gray-300">{idx + 1}</td>
                              <td className="p-0.5">
                                <img
                                  src={entry.image}
                                  className="w-7 h-7 object-cover rounded-lg border border-gray-100 mx-auto cursor-pointer hover:scale-150 transition-transform origin-center z-10 relative"
                                  onClick={() => openPreview(entry.image)}
                                  alt="후기 인증"
                                />
                              </td>
                              <td className="p-1 text-blue-600 font-black">{entry.orderNumber || <span className="text-gray-300 font-normal">미인식</span>}</td>
                              <td className="p-1">{entry.ordererName || <span className="text-gray-300 font-normal">미인식</span>}</td>
                              {(() => {
                                const parts = (entry.bankInfo || '').split(/[\/\s]+/).filter(Boolean);
                                return (<>
                                  <td className="p-1">{parts[0] || <span className="text-gray-300 font-normal">-</span>}</td>
                                  <td className="p-1 text-blue-600">{parts[1] || <span className="text-gray-300 font-normal">-</span>}</td>
                                  <td className="p-1">{parts[2] || <span className="text-gray-300 font-normal">-</span>}</td>
                                </>);
                              })()}
                              <td className="p-1 text-gray-400">{entry.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ) : adminTab === 'deposit' ? (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl overflow-hidden animate-in slide-in-from-right-10 duration-500">
                  <div className="p-6 bg-white border-b sticky left-0 z-30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <button onClick={() => { setDepositSubTab('before'); setSelectedDepositIds(new Set()); }} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${depositSubTab === 'before' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          입금전 ({manualEntries.filter(e => e.beforeDeposit && !e.afterDeposit).length})
                        </button>
                        <button onClick={() => { setDepositSubTab('after'); setSelectedDepositIds(new Set()); }} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${depositSubTab === 'after' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          입금완료 ({manualEntries.filter(e => e.afterDeposit).length})
                        </button>
                      </div>
                      {depositSubTab === 'before' && manualEntries.filter(e => e.beforeDeposit && !e.afterDeposit).length > 0 && (
                        <div className="flex gap-2">
                          {selectedBiz === 'angun' && <button onClick={downloadBeforeDepositCsv} className="px-3 py-2 rounded-xl text-sm font-black bg-green-600 text-white hover:bg-green-700 transition-all">
                            안군
                          </button>}
                          {selectedBiz === 'zoe' && <button onClick={async () => {
                            const beforeItems = manualEntries.filter(e => e.beforeDeposit && !e.afterDeposit);
                            if (beforeItems.length === 0) return alert("다운로드할 데이터가 없습니다.");
                            const XLSX = await import('xlsx');
                            const BANKS = ['카카오뱅크','토스뱅크','케이뱅크','우리은행','SC제일','새마을','우체국','농협','국민','신한','하나','우리','기업','수협','신협','대구','부산','경남','광주','전북','제주','IBK','KB','NH'];
                            const parseAccount = (raw: string): [string, string, string] => {
                              if (!raw || !raw.trim()) return ['', '', ''];
                              const str = raw.trim();
                              let bank = '';
                              for (const b of BANKS) { if (str.includes(b)) { bank = b; break; } }
                              const m = str.match(/\d[\d\-\s]*\d|\d+/);
                              const account = m ? m[0].trim() : '';
                              let remaining = str;
                              if (bank) remaining = remaining.replace(bank, '');
                              if (account) remaining = remaining.replace(account, '');
                              remaining = remaining.replace(/[\d\-\s]/g, '');
                              const BANK_WORDS = ['카카오뱅크','토스뱅크','케이뱅크','우리은행','SC제일은행','새마을금고','우체국','카카오','토스','은행','뱅크','금고','NH','IBK','KB','SC'];
                              for (const w of BANK_WORDS) { remaining = remaining.split(w).join(''); }
                              return [bank, account, remaining.trim()];
                            };
                            const allRows = beforeItems.map(e => {
                              const [bank, account] = parseAccount(e.accountNumber);
                              return [bank, account, e.paymentAmount || '', e.name1 || e.name2 || '', '조에농원환불'];
                            });
                            const chunkSize = 15;
                            const today = toLocalDateStr();
                            for (let i = 0; i < allRows.length; i += chunkSize) {
                              const chunk = allRows.slice(i, i + chunkSize);
                              const ws = XLSX.utils.aoa_to_sheet(chunk);
                              const wb = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(wb, ws, '조에환불');
                              XLSX.writeFile(wb, `${today} 조에환불_${(i / chunkSize) + 1}.xlsx`);
                            }
                            const wsAll = XLSX.utils.aoa_to_sheet(allRows);
                            const wbAll = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wbAll, wsAll, '조에환불');
                            XLSX.writeFile(wbAll, `${today} 조에환불_통합.xlsx`);
                          }} className="px-3 py-2 rounded-xl text-sm font-black bg-purple-600 text-white hover:bg-purple-700 transition-all">
                            조에
                          </button>}
                          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl">
                            <input type="date" value={depositActionDate} onChange={e => setDepositActionDate(e.target.value)} className="bg-transparent text-xs font-bold outline-none px-2 text-gray-600" />
                            <button
                              onClick={handleBulkDepositComplete}
                              className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${selectedDepositIds.size > 0 ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                            >
                              입금완료 ({selectedDepositIds.size}건)
                            </button>
                          </div>
                        </div>
                      )}
                      {depositSubTab === 'after' && manualEntries.filter(e => e.afterDeposit).length > 0 && (
                        <button
                          onClick={handleBulkDepositCancel}
                          className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${selectedDepositIds.size > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                        >
                          취소 ({selectedDepositIds.size}건)
                        </button>
                      )}
                    </div>

                    {/* ✅ 입금관리 검색 (변경 사항 4) */}
                    <div className="px-6 pb-4">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="이름 / 주문번호 / 계좌번호 검색"
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-2xl text-sm font-bold outline-none border border-transparent focus:border-blue-500 transition-all"
                          value={depositSearch}
                          onChange={(e) => setDepositSearch(e.target.value)}
                        />
                        <span className="absolute left-4 top-3.5 text-gray-400">🔍</span>
                        {depositSearch && depositSearch !== debouncedDepositSearch && (
                          <span className="absolute right-4 top-3.5 text-xs text-gray-400">검색중...</span>
                        )}
                      </div>
                    </div>

                    {renderDatePicker(
                      depositSubTab === 'before' ? depositBeforeDate : depositAfterDate,
                      depositSubTab === 'before' ? setDepositBeforeDate : setDepositAfterDate,
                      depositCalOpen, setDepositCalOpen,
                      depositCalMonth, setDepositCalMonth,
                      manualEntries.filter(e => depositSubTab === 'before' ? (e.beforeDeposit && !e.afterDeposit) : e.afterDeposit).reduce((acc, e) => {
                        if (e.date) acc[e.date] = (acc[e.date] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    )}
                  </div>
                  <div className="overflow-x-auto" onMouseUp={() => { isDraggingRef.current = false; }} onMouseLeave={() => { isDraggingRef.current = false; }}>
                    {depositSubTab === 'before' ? (() => {
                      // ✅ debouncedDepositSearch 사용 (변경 사항 5)
                      const beforeItems = manualEntries.filter(e => {
                        const isBefore = e.beforeDeposit && !e.afterDeposit;
                        if (!isBefore) return false;

                        // 3개월 제한 (검색 시)
                        const limitDate = new Date();
                        limitDate.setMonth(limitDate.getMonth() - 3);
                        const limitDateStr = toLocalDateStr(limitDate);

                        if (debouncedDepositSearch) {
                          // 검색 시 'all'이면 3개월 제한
                          if (depositBeforeDate === 'all' && e.date < limitDateStr) return false;

                          const q = debouncedDepositSearch.toLowerCase();
                          return String(e.name1 || '').toLowerCase().includes(q)
                            || String(e.name2 || '').toLowerCase().includes(q)
                            || String(e.orderNumber || '').toLowerCase().includes(q)
                            || String(e.accountNumber || '').toLowerCase().includes(q);
                        }
                        return depositBeforeDate === 'all' || e.date === depositBeforeDate;
                      });
                      const allSelected = beforeItems.length > 0 && beforeItems.every(e => selectedDepositIds.has(e.id));
                      return (
                        <table className="w-full text-xs text-center">
                          <thead className="bg-gray-100 text-gray-500 font-bold">
                            <tr>
                              <th className="py-0.5 px-2 w-8">
                                <input type="checkbox" className="w-3 h-3 accent-blue-600" checked={allSelected} onChange={() => {
                                  if (allSelected) {
                                    setSelectedDepositIds(new Set());
                                  } else {
                                    setSelectedDepositIds(new Set(beforeItems.map(e => e.id)));
                                  }
                                }} />
                              </th>
                              <th className="py-0.5 px-2">날짜</th>
                              <th className="py-0.5 px-2">이름1</th>
                              <th className="py-0.5 px-2">이름2</th>
                              <th className="py-0.5 px-2 hidden md:table-cell">주문번호</th>
                              <th className="py-0.5 px-2">결제금액</th>
                              <th className="py-0.5 px-2">계좌번호</th>
                              <th className="py-0.5 px-2 w-14 hidden md:table-cell">해제</th>
                            </tr>
                          </thead>
                          <tbody>
                            {beforeItems.flatMap((entry, idx) => {
                              const rows = [];
                              rows.push(
                              <tr key={entry.id}
                                className={`border-t ${selectedDepositIds.has(entry.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              >
                                <td className="py-0 px-2">
                                  <input type="checkbox" className="w-3 h-3 accent-blue-600" checked={selectedDepositIds.has(entry.id)} onChange={() => {
                                    const next = new Set(selectedDepositIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedDepositIds(next);
                                  }} />
                                </td>
                                <td className="py-0 px-2">
                                  {entry.isManualCheck && <span className="inline-block px-1 rounded bg-orange-100 text-orange-600 text-[8px] font-black mr-0.5">수동</span>}
                                  {entry.date ? entry.date.slice(2).replace(/-/g, '.') : ''}
                                </td>
                                <td className="py-0 px-2">{entry.name1}</td>
                                <td className="py-0 px-2">{entry.name2}</td>
                                <td className="py-0 px-2 text-blue-600 font-black hidden md:table-cell">{entry.orderNumber}</td>
                                <td className="py-0 px-2">{entry.paymentAmount ? entry.paymentAmount.toLocaleString() + '원' : ''}</td>
                                <td className="py-0 px-2 text-blue-600">{entry.accountNumber}</td>
                                <td className="py-0 px-2 hidden md:table-cell">
                                  <button onClick={() => handleDepositRelease(entry.id, 'before')} className="px-1 py-0 bg-red-50 text-red-500 rounded text-[8px] font-black hover:bg-red-100 transition-all mr-0.5">해제</button>
                                  <button onClick={() => handleDepositDelete(entry.id)} className="px-1 py-0 bg-gray-100 text-gray-400 rounded text-[8px] font-black hover:bg-gray-200 transition-all">삭제</button>
                                </td>
                              </tr>
                              );
                              if ((idx + 1) % 15 === 0 || idx === beforeItems.length - 1) {
                                const start = Math.floor(idx / 15) * 15;
                                const groupItems = beforeItems.slice(start, idx + 1);
                                const subtotal = groupItems.reduce((sum, e) => sum + (e.paymentAmount || 0), 0);
                                rows.push(
                                  <tr key={`subtotal-${idx}`} className="border-t-2 border-yellow-400 bg-yellow-50">
                                    <td colSpan={5} className="py-0.5 px-2 text-right text-[10px] font-black text-yellow-700">
                                      소계 ({start + 1}~{idx + 1})
                                    </td>
                                    <td colSpan={3} className="py-0.5 px-2 text-left text-[10px] font-black text-yellow-700">
                                      {subtotal.toLocaleString()}원
                                    </td>
                                  </tr>
                                );
                              }
                              return rows;
                            })}
                            {beforeItems.length === 0 && (
                              <tr><td colSpan={8} className="p-16 text-gray-300 font-bold">
                                {debouncedDepositSearch ? `"${debouncedDepositSearch}" 검색 결과가 없습니다.` : '입금 대기 항목이 없습니다.'}
                              </td></tr>
                            )}
                          </tbody>
                        </table>
                      );
                    })() : (() => {
                      // ✅ debouncedDepositSearch 사용 (변경 사항 6)
                      const afterItems = manualEntries.filter(e => {
                        const isAfter = e.afterDeposit;
                        if (!isAfter) return false;

                        // 3개월 제한 (검색 시)
                        const limitDate = new Date();
                        limitDate.setMonth(limitDate.getMonth() - 3);
                        const limitDateStr = toLocalDateStr(limitDate);

                        if (debouncedDepositSearch) {
                          // 검색 시 'all'이면 3개월 제한
                          if (depositAfterDate === 'all' && e.date < limitDateStr) return false;

                          const q = debouncedDepositSearch.toLowerCase();
                          return String(e.name1 || '').toLowerCase().includes(q)
                            || String(e.name2 || '').toLowerCase().includes(q)
                            || String(e.orderNumber || '').toLowerCase().includes(q)
                            || String(e.accountNumber || '').toLowerCase().includes(q);
                        }
                        return depositAfterDate === 'all' || e.date === depositAfterDate;
                      });
                      afterItems.sort((a, b) => (b.depositDate || '').localeCompare(a.depositDate || ''));
                      const allAfterSelected = afterItems.length > 0 && afterItems.every(e => selectedDepositIds.has(e.id));
                      return (
                        <table className="w-full text-xs text-center">
                          <thead className="bg-gray-100 text-gray-500 font-bold">
                            <tr>
                              <th className="py-1 px-2 w-10">
                                <input type="checkbox" className="w-3 h-3 accent-green-600" checked={allAfterSelected} onChange={() => {
                                  if (allAfterSelected) {
                                    setSelectedDepositIds(new Set());
                                  } else {
                                    setSelectedDepositIds(new Set(afterItems.map(e => e.id)));
                                  }
                                }} />
                              </th>
                              <th className="py-1 px-2">구매날짜</th>
                              <th className="py-1 px-2 text-blue-600">입금날짜</th>
                              <th className="py-1 px-2">이름1</th>
                              <th className="py-1 px-2">이름2</th>
                              <th className="py-1 px-2 hidden md:table-cell">주문번호</th>
                              <th className="py-1 px-2">결제금액</th>
                              <th className="py-1 px-2 hidden md:table-cell">계좌번호</th>
                              <th className="py-1 px-2 w-16 hidden md:table-cell">해제</th>
                            </tr>
                          </thead>
                          <tbody>
                            {afterItems.map((entry) => (
                              <tr key={entry.id}
                                className={`border-t ${selectedDepositIds.has(entry.id) ? 'bg-red-50' : 'bg-green-50/30'}`}
                              >
                                <td className="py-0.5 px-2">
                                  <input type="checkbox" className="w-3 h-3 accent-green-600" checked={selectedDepositIds.has(entry.id)} onChange={() => {
                                    const next = new Set(selectedDepositIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedDepositIds(next);
                                  }} />
                                </td>
                                <td className="py-0.5 px-2">{entry.date ? entry.date.slice(2).replace(/-/g, '.') : ''}</td>
                                <td className="py-0.5 px-2 text-blue-600">{entry.depositDate ? entry.depositDate.slice(2).replace(/-/g, '.') : '-'}</td>
                                <td className="py-0.5 px-2">{entry.name1}</td>
                                <td className="py-0.5 px-2">{entry.name2}</td>
                                <td className="py-0.5 px-2 text-blue-600 font-black hidden md:table-cell">{entry.orderNumber}</td>
                                <td className="py-0.5 px-2">{entry.paymentAmount ? entry.paymentAmount.toLocaleString() + '원' : ''}</td>
                                <td className="py-0.5 px-2 text-blue-600 hidden md:table-cell">{entry.accountNumber}</td>
                                <td className="py-0.5 px-2 hidden md:table-cell">
                                  <button onClick={() => handleDepositRelease(entry.id, 'after')} className="px-1 py-0 bg-red-50 text-red-500 rounded text-[8px] font-black hover:bg-red-100 transition-all mr-0.5">해제</button>
                                  <button onClick={() => handleDepositDelete(entry.id)} className="px-1 py-0 bg-gray-100 text-gray-400 rounded text-[8px] font-black hover:bg-gray-200 transition-all">삭제</button>
                                </td>
                              </tr>
                            ))}
                            {afterItems.length === 0 && (
                              <tr><td colSpan={9} className="p-16 text-gray-300 font-bold">
                                {debouncedDepositSearch ? `"${debouncedDepositSearch}" 검색 결과가 없습니다.` : '입금 완료된 항목이 없습니다.'}
                              </td></tr>
                            )}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </section>
              ) : adminTab === 'sales' ? (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl p-4 sm:p-8 animate-in slide-in-from-right-10 duration-500">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg sm:text-xl font-black text-gray-900">매출현황</h2>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSalesMonth(p => { let m = p.month - 1, y = p.year; if (m < 1) { m = 12; y--; } return { year: y, month: m }; })} className="px-2 py-2 text-gray-500 hover:text-gray-800 font-black text-sm">&larr;</button>
                      <span className="text-sm font-black text-gray-700 min-w-[100px] text-center">{salesMonth.year}.{salesMonth.month}월</span>
                      <button onClick={() => setSalesMonth(p => { let m = p.month + 1, y = p.year; if (m > 12) { m = 1; y++; } return { year: y, month: m }; })} className="px-2 py-2 text-gray-500 hover:text-gray-800 font-black text-sm">&rarr;</button>
                    </div>
                  </div>
                  {/* 서브 탭 */}
                  <div className="flex gap-1.5 sm:gap-2 mb-6 overflow-x-auto">
                    <button onClick={() => setSalesSubTab('summary')} className={`px-5 py-2 rounded-xl text-sm font-black transition-colors ${salesSubTab === 'summary' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>요약</button>
                    <button onClick={() => setSalesSubTab('profitLoss')} className={`px-5 py-2 rounded-xl text-sm font-black transition-colors ${salesSubTab === 'profitLoss' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>손익표</button>
                    <button onClick={() => setSalesSubTab('salesDetail')} className={`px-5 py-2 rounded-xl text-sm font-black transition-colors ${salesSubTab === 'salesDetail' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>품목별판매</button>
                  </div>

                  {salesSubTab === 'summary' ? (() => {
                    // 모든 월 데이터 수집
                    const monthSet = new Set<string>();
                    salesDaily.forEach(e => {
                      if (e.date) monthSet.add(e.date.substring(0, 7));
                    });
                    const months = Array.from(monthSet).sort();

                    // 품목 목록 수집 (품목별판매 페이지와 동일하게 정규화 이름으로 묶음)
                    const productSet = new Set<string>();
                    salesDaily.forEach(e => { if (e.product) productSet.add(normProductName(e.product)); });
                    const products = Array.from(productSet).sort();

                    // 월별 품목별 집계
                    type MonthProduct = { supply: number; margin: number; qty: number; ad: number; hp: number; sol: number; net: number };
                    const data: Record<string, Record<string, MonthProduct>> = {};
                    const monthTotals: Record<string, MonthProduct> = {};

                    months.forEach(m => {
                      data[m] = {};
                      monthTotals[m] = { supply: 0, margin: 0, qty: 0, ad: 0, hp: 0, sol: 0, ref: 0, net: 0 };
                    });

                    salesDaily.forEach(e => {
                      const m = e.date?.substring(0, 7);
                      if (!m || !data[m]) return;
                      const pName = normProductName(e.product);
                      if (!data[m][pName]) data[m][pName] = { supply: 0, margin: 0, qty: 0, ad: 0, hp: 0, sol: 0, ref: 0, net: 0 };
                      const d = data[m][pName];
                      d.supply += e.supplyPrice || 0;
                      d.margin += e.totalMargin || 0;
                      d.qty += e.quantity || 0;
                      d.ad += e.adCost || 0;
                      d.hp += e.housePurchase || 0;
                      d.sol += e.solution || 0;
                      d.ref += e.refund || 0;
                      d.net = d.margin + d.ad + d.hp + d.sol + d.ref;

                      const mt = monthTotals[m];
                      mt.supply += e.supplyPrice || 0;
                      mt.margin += e.totalMargin || 0;
                      mt.qty += e.quantity || 0;
                      mt.ad += e.adCost || 0;
                      mt.hp += e.housePurchase || 0;
                      mt.sol += e.solution || 0;
                      mt.ref += e.refund || 0;
                      mt.net = mt.margin + mt.ad + mt.hp + mt.sol + mt.ref;
                    });

                    const fmt = (n: number) => n ? n.toLocaleString() : '-';
                    const fmtColor = (n: number) => n > 0 ? 'text-blue-600' : n < 0 ? 'text-red-500' : 'text-gray-300';

                    // 월별 비용 집계 (monthlyOverhead 상태에서 읽음 - getDocs 캐시)
                    const monthCosts: Record<string, number> = {};
                    months.forEach(m => {
                      const cats = monthlyOverhead[m] || {};
                      monthCosts[m] = Object.values(cats).reduce((s, v) => s + v, 0);
                    });

                    // 전체 합계
                    const grandTotal = { supply: 0, margin: 0, qty: 0, ad: 0, hp: 0, sol: 0, ref: 0, net: 0, cost: 0, profit: 0 };
                    months.forEach(m => {
                      grandTotal.supply += monthTotals[m].supply;
                      grandTotal.margin += monthTotals[m].margin;
                      grandTotal.qty += monthTotals[m].qty;
                      grandTotal.ad += monthTotals[m].ad;
                      grandTotal.hp += monthTotals[m].hp;
                      grandTotal.sol += monthTotals[m].sol;
                      grandTotal.ref += monthTotals[m].ref;
                      grandTotal.cost += monthCosts[m] || 0;
                    });
                    grandTotal.net = grandTotal.margin + grandTotal.ad + grandTotal.hp + grandTotal.sol + grandTotal.ref;
                    grandTotal.profit = grandTotal.net - grandTotal.cost;

                    return (
                      <div className="space-y-6">
                        {/* 월별 총 요약 카드 - 상반기/하반기 */}
                        {(() => {
                          const firstHalf = months.filter(m => parseInt(m.split('-')[1]) <= 6);
                          const secondHalf = months.filter(m => parseInt(m.split('-')[1]) > 6);
                          const renderCard = (m: string) => {
                            const t = monthTotals[m];
                            const cost = monthCosts[m] || 0;
                            const profit = t.net - cost;
                            return (
                              <div key={m} className="border rounded-xl p-4 space-y-2">
                                <div className="text-sm font-black text-gray-700">{parseInt(m.split('-')[1])}월</div>
                                <div className={`text-xl font-black ${fmtColor(profit)}`}>{fmt(profit)}</div>
                                <div className="text-[10px] text-gray-400 space-y-0.5">
                                  <div className="flex justify-between"><span>순이익</span><span className={fmtColor(t.net)}>{fmt(t.net)}</span></div>
                                  <div className="flex justify-between font-bold"><span>비용합계</span><span className={cost ? 'text-red-400' : 'text-gray-300'}>{cost ? `-${cost.toLocaleString()}` : '-'}</span></div>
                                  {Object.entries(monthlyOverhead[m] || {}).map(([cat, amt]) => (
                                    <div key={cat} className="flex justify-between pl-2"><span>{cat}</span><span className="text-red-400">-{(amt as number).toLocaleString()}</span></div>
                                  ))}
                                  <div className="flex justify-between border-t pt-0.5 mt-0.5"><span>마진</span><span className="text-gray-600">{fmt(t.margin)}</span></div>
                                  <div className="flex justify-between"><span>광고비</span><span className={fmtColor(t.ad)}>{fmt(t.ad)}</span></div>
                                  <div className="flex justify-between"><span>가구매</span><span className={fmtColor(t.hp)}>{fmt(t.hp)}</span></div>
                                  <div className="flex justify-between"><span>슬롯</span><span className={fmtColor(t.sol)}>{fmt(t.sol)}</span></div>
                                  <div className="flex justify-between border-t pt-0.5 mt-0.5"><span>수량</span><span className="text-gray-600">{t.qty.toLocaleString()}</span></div>
                                </div>
                              </div>
                            );
                          };
                          return (
                            <div className="space-y-2">
                              {firstHalf.length > 0 && (
                                <div>
                                  <div className="text-[10px] text-gray-400 font-bold mb-1">상반기</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{firstHalf.map(renderCard)}</div>
                                </div>
                              )}
                              {secondHalf.length > 0 && (
                                <div>
                                  <div className="text-[10px] text-gray-400 font-bold mb-1">하반기</div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{secondHalf.map(renderCard)}</div>
                                </div>
                              )}
                              {months.length > 1 && (
                                <div className="border-2 border-gray-900 rounded-xl p-4 space-y-2">
                                  <div className="text-sm font-black text-gray-900">전체 합계</div>
                                  <div className={`text-xl font-black ${fmtColor(grandTotal.profit)}`}>{fmt(grandTotal.profit)}</div>
                                  <div className="text-[10px] text-gray-400 space-y-0.5">
                                    <div className="flex justify-between"><span>순이익</span><span className={fmtColor(grandTotal.net)}>{fmt(grandTotal.net)}</span></div>
                                    <div className="flex justify-between font-bold"><span>비용합계</span><span className={grandTotal.cost ? 'text-red-400' : 'text-gray-300'}>{grandTotal.cost ? `-${grandTotal.cost.toLocaleString()}` : '-'}</span></div>
                                    {(() => {
                                      const allCats: Record<string, number> = {};
                                      months.forEach(m => {
                                        Object.entries(monthlyOverhead[m] || {}).forEach(([cat, amt]) => {
                                          allCats[cat] = (allCats[cat] || 0) + (amt as number);
                                        });
                                      });
                                      return Object.entries(allCats).map(([cat, amt]) => (
                                        <div key={cat} className="flex justify-between pl-2"><span>{cat}</span><span className="text-red-400">-{amt.toLocaleString()}</span></div>
                                      ));
                                    })()}
                                    <div className="flex justify-between border-t pt-0.5 mt-0.5"><span>마진</span><span className="text-gray-600">{fmt(grandTotal.margin)}</span></div>
                                    <div className="flex justify-between"><span>광고비</span><span className={fmtColor(grandTotal.ad)}>{fmt(grandTotal.ad)}</span></div>
                                    <div className="flex justify-between"><span>가구매</span><span className={fmtColor(grandTotal.hp)}>{fmt(grandTotal.hp)}</span></div>
                                    <div className="flex justify-between"><span>슬롯</span><span className={fmtColor(grandTotal.sol)}>{fmt(grandTotal.sol)}</span></div>
                                    <div className="flex justify-between border-t pt-0.5 mt-0.5"><span>수량</span><span className="text-gray-600">{grandTotal.qty.toLocaleString()}</span></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* 품목별 × 월별 매트릭스 (순이익만) */}
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-xs text-center min-w-[500px]">
                            <thead className="bg-gray-100 text-gray-500 font-bold">
                              <tr>
                                <th className="py-1.5 px-3 text-left">품목</th>
                                {months.map(m => (
                                  <th key={m} className="py-1.5 px-3">{parseInt(m.split('-')[1])}월</th>
                                ))}
                                {months.length > 1 && <th className="py-1.5 px-3 bg-gray-200/50">합계</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {products.map(product => {
                                let totalNet = 0;
                                months.forEach(m => {
                                  const d = data[m][product];
                                  if (d) { totalNet += d.net; }
                                });
                                if (totalNet === 0 && !months.some(m => data[m][product])) return null;
                                return (
                                  <tr key={product} className="border-t hover:bg-gray-50">
                                    <td className="py-1 px-3 text-left font-bold whitespace-nowrap">{product}</td>
                                    {months.map(m => {
                                      const d = data[m][product];
                                      return <td key={m} className={`py-1 px-3 font-bold ${fmtColor(d?.net || 0)}`}>{d ? fmt(d.net) : '-'}</td>;
                                    })}
                                    {months.length > 1 && (
                                      <td className={`py-1 px-3 bg-gray-50 font-bold ${fmtColor(totalNet)}`}>{fmt(totalNet)}</td>
                                    )}
                                  </tr>
                                );
                              })}
                              {/* 합계 행 */}
                              <tr className="font-black border-t-2 border-gray-900 bg-gray-50">
                                <td className="py-1 px-3 text-left">합계</td>
                                {months.map(m => (
                                  <td key={m} className={`py-1 px-3 ${fmtColor(monthTotals[m].net)}`}>{fmt(monthTotals[m].net)}</td>
                                ))}
                                {months.length > 1 && (
                                  <td className={`py-1 px-3 ${fmtColor(grandTotal.net)}`}>{fmt(grandTotal.net)}</td>
                                )}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })() : salesSubTab === 'profitLoss' ? (
                    /* ===== 손익표 ===== */
                    (() => {
                      const filtered = salesDaily.filter(e => e.date?.startsWith(salesMonthStr));
                      const byDate: Record<string, { margin: number; adCost: number; solution: number; refund: number; manualCost: number }> = {};
                      filtered.forEach(e => {
                        if (!byDate[e.date]) byDate[e.date] = { margin: 0, adCost: 0, solution: 0, refund: 0, manualCost: 0 };
                        byDate[e.date].margin += (e.totalMargin + e.adCost + e.housePurchase + e.solution + (e.refund || 0));
                        byDate[e.date].adCost += (e.adCost || 0);
                        byDate[e.date].solution += (e.solution || 0);
                        byDate[e.date].refund += (e.refund || 0);
                      });
                      const manualRows = manualOverhead[salesMonthStr] || [];
                      manualRows.forEach(r => {
                        if (r.date && r.date.startsWith(salesMonthStr)) {
                          if (!byDate[r.date]) byDate[r.date] = { margin: 0, adCost: 0, solution: 0, refund: 0, manualCost: 0 };
                          byDate[r.date].manualCost += r.amount;
                        }
                      });
                      const dates = Object.keys(byDate).sort();
                      const grandMargin = dates.reduce((s, d) => s + byDate[d].margin, 0);

                      const revenueByProduct: Record<string, number> = {};
                      filtered.forEach(e => {
                        const profit = e.totalMargin + e.adCost + e.housePurchase + e.solution + (e.refund || 0);
                        revenueByProduct[e.product] = (revenueByProduct[e.product] || 0) + profit;
                      });
                      const revenueItems = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1]);
                      const totalRevenue = revenueItems.reduce((s, [, v]) => s + v, 0);

                      const totalAdCost = filtered.reduce((s, e) => s + (e.adCost || 0), 0);
                      const totalSolution = filtered.reduce((s, e) => s + (e.solution || 0), 0);
                      const totalRefund = filtered.reduce((s, e) => s + (e.refund || 0), 0);

                      const monthOverheadCats = monthlyOverhead[salesMonthStr] || {};
                      const totalManual = manualRows.reduce((s, r) => s + r.amount, 0);
                      const totalOverhead = Object.values(monthOverheadCats).reduce((s, v) => s + v, 0) + totalManual;
                      const netProfit = totalRevenue - totalOverhead;

                      return (
                        <div>
                          {dates.length === 0 ? (
                            <p className="text-gray-300 text-center py-16">데이터가 없습니다.</p>
                          ) : (
                            <div className="overflow-x-auto mb-8">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-100 text-gray-500 font-bold text-center">
                                  <tr>
                                    <th className="py-1.5 px-3">날짜</th>
                                    <th className="py-1.5 px-3">마진</th>
                                    <th className="py-1.5 px-3">광고비</th>
                                    <th className="py-1.5 px-3">슬롯</th>
                                    <th className="py-1.5 px-3">반품</th>
                                    <th className="py-1.5 px-3">비용</th>
                                    <th className="py-1.5 px-3">비고</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dates.map(date => {
                                    const dayMargin = byDate[date].margin;
                                    return (
                                      <tr key={date} className="border-t hover:bg-gray-50 text-center">
                                        <td className="py-1 px-3 text-gray-600 font-bold">{date.slice(5)}</td>
                                        <td className="py-1 px-3 font-bold">{dayMargin.toLocaleString()}</td>
                                        <td className="py-1 px-3 text-red-500 font-bold">{byDate[date].adCost ? byDate[date].adCost.toLocaleString() : '-'}</td>
                                        <td className="py-1 px-3 text-red-500 font-bold">{byDate[date].solution ? byDate[date].solution.toLocaleString() : '-'}</td>
                                        <td className="py-1 px-3 text-red-500 font-bold">{byDate[date].refund ? byDate[date].refund.toLocaleString() : '-'}</td>
                                        <td className="py-1 px-3 text-orange-500 font-bold">{byDate[date].manualCost ? byDate[date].manualCost.toLocaleString() : '-'}</td>
                                        <td className="py-1 px-3">
                                          <input
                                            type="text"
                                            className="w-full bg-transparent border-b border-transparent focus:border-gray-400 outline-none text-gray-500 text-center text-xs"
                                            defaultValue={dailyMemos[date] || ''}
                                            onBlur={e => { const v = e.target.value; if (v !== (dailyMemos[date] || '')) handleSaveMemo(date, v); }}
                                            placeholder="메모"
                                          />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="border-t-2 border-gray-900 bg-gray-50 font-black text-center">
                                    <td className="py-1.5 px-3">합계</td>
                                    <td className="py-1.5 px-3" style={{ color: grandMargin >= 0 ? '#16a34a' : '#dc2626' }}>{grandMargin.toLocaleString()}</td>
                                    <td></td><td></td><td></td><td></td><td></td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 손익계산서 */}
                          <div className="border-2 border-gray-300 rounded-xl overflow-hidden">
                            <div className="bg-white border-b-2 border-gray-300 py-4 text-center">
                              <h3 className="text-xl font-black text-gray-900">{salesMonth.month}월 손익 계산서</h3>
                            </div>

                            {/* 품목별 순마진 */}
                            <div>
                              <div className="bg-yellow-50 border-b border-gray-300 py-2 text-center font-black text-sm text-gray-800">품목별 순마진</div>
                              <div className="text-right text-[10px] text-gray-400 px-3 py-1 border-b border-gray-200">(단위 : 원)</div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-300 bg-gray-50">
                                    <th className="py-1.5 px-3 text-left font-bold text-gray-600">항목</th>
                                    <th className="py-1.5 px-3 text-right font-bold text-gray-600">금액</th>
                                    <th className="py-1.5 px-3 text-right font-bold text-gray-600 w-16">비율</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {revenueItems.map(([name, amount]) => (
                                    <tr key={name} className="border-b border-gray-100">
                                      <td className="py-1.5 px-3 text-gray-700">{name}</td>
                                      <td className="py-1.5 px-3 text-right font-bold">{amount.toLocaleString()}</td>
                                      <td className="py-1.5 px-3 text-right text-gray-500">{totalRevenue ? Math.round(amount / totalRevenue * 100) : 0}%</td>
                                    </tr>
                                  ))}
                                  {revenueItems.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-gray-300">데이터 없음</td></tr>}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                                    <td className="py-2 px-3 font-black text-gray-800">순마진 합계</td>
                                    <td className="py-2 px-3 text-right font-black text-gray-800">{totalRevenue.toLocaleString()}</td>
                                    <td className="py-2 px-3"></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* 비용 내역 */}
                            <div className="border-t-2 border-gray-300">
                              <div className="bg-red-50 border-b border-gray-300 py-2 text-center font-black text-sm text-gray-800">비용 내역</div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-300 bg-gray-50">
                                    <th className="py-1.5 px-3 text-left font-bold text-gray-600">항목</th>
                                    <th className="py-1.5 px-3 text-right font-bold text-gray-600">금액</th>
                                    <th className="py-1.5 px-3 text-right font-bold text-gray-600 w-16">비율</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* 참고용: 품목별 비용 (이미 순마진에 차감 반영됨) */}
                                  {(totalAdCost !== 0 || totalSolution !== 0 || totalRefund !== 0) && (
                                    <>
                                      <tr className="bg-gray-50 border-b border-gray-200">
                                        <td colSpan={3} className="py-1 px-3 text-[10px] text-gray-400">※ 아래 항목은 품목별 순마진에 이미 차감 반영됨 (참고용)</td>
                                      </tr>
                                      {totalAdCost !== 0 && (
                                        <tr className="border-b border-gray-100 text-gray-400">
                                          <td className="py-1.5 px-3">광고비</td>
                                          <td className="py-1.5 px-3 text-right font-bold">{totalAdCost.toLocaleString()}</td>
                                          <td className="py-1.5 px-3 text-right">{totalRevenue ? Math.round(Math.abs(totalAdCost) / totalRevenue * 100) : 0}%</td>
                                        </tr>
                                      )}
                                      {totalSolution !== 0 && (
                                        <tr className="border-b border-gray-100 text-gray-400">
                                          <td className="py-1.5 px-3">슬롯</td>
                                          <td className="py-1.5 px-3 text-right font-bold">{totalSolution.toLocaleString()}</td>
                                          <td className="py-1.5 px-3 text-right">{totalRevenue ? Math.round(Math.abs(totalSolution) / totalRevenue * 100) : 0}%</td>
                                        </tr>
                                      )}
                                      {totalRefund !== 0 && (
                                        <tr className="border-b border-gray-100 text-gray-400">
                                          <td className="py-1.5 px-3">반품</td>
                                          <td className="py-1.5 px-3 text-right font-bold">{totalRefund.toLocaleString()}</td>
                                          <td className="py-1.5 px-3 text-right">{totalRevenue ? Math.round(Math.abs(totalRefund) / totalRevenue * 100) : 0}%</td>
                                        </tr>
                                      )}
                                      <tr className="border-b-2 border-gray-200 bg-gray-50"></tr>
                                    </>
                                  )}
                                  {Object.entries(monthOverheadCats).map(([cat, amt]) => (
                                    <tr key={cat} className="border-b border-gray-100">
                                      <td className="py-1.5 px-3 text-gray-700">{cat}</td>
                                      <td className="py-1.5 px-3 text-right font-bold text-red-500">-{(amt as number).toLocaleString()}</td>
                                      <td className="py-1.5 px-3 text-right text-gray-500">{totalRevenue ? Math.round((amt as number) / totalRevenue * 100) : 0}%</td>
                                    </tr>
                                  ))}
                                  {Object.keys(monthOverheadCats).length === 0 && manualRows.length === 0 && (
                                    <tr><td colSpan={3} className="py-4 text-center text-gray-300">비용 데이터 없음 (업무일지 비용시트 업로드 필요)</td></tr>
                                  )}
                                  {/* 직접 입력 비용 */}
                                  {manualRows.length > 0 && (
                                    <tr className="bg-orange-50 border-b border-orange-200">
                                      <td colSpan={3} className="py-1 px-3 text-[10px] text-orange-400 font-bold">직접 입력</td>
                                    </tr>
                                  )}
                                  {manualRows.map((row, idx) => (
                                    <tr key={row.id} className="border-b border-gray-100 bg-orange-50/30">
                                      <td className="py-1 px-3">
                                        <div className="flex flex-col gap-0.5">
                                          <input
                                            type="text"
                                            className="w-full bg-transparent border-b border-transparent focus:border-orange-300 outline-none text-gray-700 text-xs"
                                            value={row.name}
                                            onChange={e => {
                                              const updated = manualRows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r);
                                              setManualOverhead(prev => ({ ...prev, [salesMonthStr]: updated }));
                                            }}
                                            onBlur={() => saveManualOverheadRows(salesMonthStr, manualRows)}
                                            placeholder="항목명"
                                          />
                                          <input
                                            type="date"
                                            className="w-full bg-transparent outline-none text-[10px] text-gray-400 focus:text-orange-400"
                                            value={row.date || ''}
                                            min={`${salesMonthStr}-01`}
                                            max={`${salesMonthStr}-31`}
                                            onChange={e => {
                                              const updated = manualRows.map((r, i) => i === idx ? { ...r, date: e.target.value || undefined } : r);
                                              setManualOverhead(prev => ({ ...prev, [salesMonthStr]: updated }));
                                            }}
                                            onBlur={() => saveManualOverheadRows(salesMonthStr, manualRows)}
                                          />
                                        </div>
                                      </td>
                                      <td className="py-1 px-3 text-right">
                                        <input
                                          type="number"
                                          className="w-full bg-transparent border-b border-transparent focus:border-orange-300 outline-none text-right text-red-500 font-bold text-xs"
                                          value={row.amount || ''}
                                          onChange={e => {
                                            const updated = manualRows.map((r, i) => i === idx ? { ...r, amount: Number(e.target.value) || 0 } : r);
                                            setManualOverhead(prev => ({ ...prev, [salesMonthStr]: updated }));
                                          }}
                                          onBlur={() => saveManualOverheadRows(salesMonthStr, manualRows)}
                                          placeholder="0"
                                        />
                                      </td>
                                      <td className="py-1 px-3 text-right">
                                        <button
                                          onClick={() => {
                                            const updated = manualRows.filter((_, i) => i !== idx);
                                            saveManualOverheadRows(salesMonthStr, updated);
                                          }}
                                          className="text-red-300 hover:text-red-500 text-xs font-bold"
                                        >&times;</button>
                                      </td>
                                    </tr>
                                  ))}
                                  {/* + 비용 추가 버튼 */}
                                  <tr>
                                    <td colSpan={3} className="py-1.5 px-3">
                                      <button
                                        onClick={() => {
                                          const newRow = { id: `manual-${Date.now()}`, name: '', amount: 0 };
                                          const updated = [...manualRows, newRow];
                                          setManualOverhead(prev => ({ ...prev, [salesMonthStr]: updated }));
                                        }}
                                        className="text-xs text-orange-500 hover:text-orange-700 font-bold"
                                      >+ 비용 추가</button>
                                    </td>
                                  </tr>
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                                    <td className="py-2 px-3 font-black text-gray-800">총 비용</td>
                                    <td className="py-2 px-3 text-right font-black text-red-500">{totalOverhead ? `-${totalOverhead.toLocaleString()}` : '-'}</td>
                                    <td className="py-2 px-3"></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* 순이익 */}
                            <div className="border-t-2 border-gray-900 bg-gray-50 px-4 py-4 flex justify-between items-center">
                              <span className="text-base font-black text-gray-900">순이익</span>
                              <span className={`text-xl font-black ${netProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{netProfit.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    /* ===== 판매현황 ===== */
                    <div>
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 justify-between items-start sm:items-center mb-4">
                        <p className="text-[11px] text-gray-400 hidden sm:block">마진 데이터는 업무일지(발주앱)에서 업로드하며, 가구매는 구매목록 수량 기반으로 자동 계산됩니다.</p>
                        <div className="flex gap-2 items-center flex-wrap">
                          {salesUndoStack.length > 0 && (
                            <button onClick={handleSalesUndo} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors" title="실행취소"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg></button>
                          )}
                          {salesRedoStack.length > 0 && (
                            <button onClick={handleSalesRedo} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors" title="다시실행"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4m4 4l-4 4" /></svg></button>
                          )}
                          <button onClick={() => salesFileRef.current?.click()} className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-black text-xs hover:bg-green-700 transition-colors">업무일지 업로드</button>
                          <input ref={salesFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSalesUpload} />
                          {lastUploadInfo && (
                            <button onClick={handleDeleteLastUpload} className="px-4 py-2.5 bg-red-100 text-red-600 rounded-xl font-black text-xs hover:bg-red-200 transition-colors">업로드 삭제 ({lastUploadInfo.uploadDate})</button>
                          )}
                          <button onClick={handleSalesAddProduct} className="px-4 py-2.5 bg-gray-200 text-gray-600 rounded-xl font-black text-xs hover:bg-gray-300 transition-colors">+ 품목추가</button>

                        </div>
                      </div>

                      {(() => {
                        const filtered = salesDaily.filter(e => e.date?.startsWith(salesMonthStr));
                        const byProduct: Record<string, SalesDailyEntry[]> = {};
                        filtered.forEach(e => {
                          const key = normProductName(e.product);
                          if (!byProduct[key]) byProduct[key] = [];
                          byProduct[key].push(e);
                        });
                        const productNames = Object.keys(byProduct).sort();

                        if (productNames.length === 0) return <p className="text-gray-300 text-center py-16">품목추가 버튼으로 품목을 생성하거나, 업무일지를 업로드하세요.</p>;

                        return (
                          <div className="space-y-8">
                            {productNames.map(product => {
                              const entries = byProduct[product].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                              const hpCountByDate: Record<string, { 빈박: number; 실배: number }> = {};
                              manualEntries.forEach(me => {
                                if (normProductName(me.product) !== product) return;
                                if (!hpCountByDate[me.date]) hpCountByDate[me.date] = { 빈박: 0, 실배: 0 };
                                if (String(me.orderNumber || '').includes('실배')) hpCountByDate[me.date].실배 += 1;
                                else hpCountByDate[me.date].빈박 += 1;
                              });
                              const hpCountTotal = Object.values(hpCountByDate).reduce((s, n) => ({ 빈박: s.빈박 + n.빈박, 실배: s.실배 + n.실배 }), { 빈박: 0, 실배: 0 });
                              const totals = {
                                supplyPrice: entries.reduce((s, e) => s + e.supplyPrice, 0),
                                totalMargin: entries.reduce((s, e) => s + e.totalMargin, 0),
                                quantity: entries.reduce((s, e) => s + e.quantity, 0),
                                adCost: entries.reduce((s, e) => s + e.adCost, 0),
                                housePurchase: entries.reduce((s, e) => s + e.housePurchase, 0),
                                solution: entries.reduce((s, e) => s + e.solution, 0),
                                refund: entries.reduce((s, e) => s + (e.refund || 0), 0),
                              };
                              const profit = totals.totalMargin + totals.adCost + totals.housePurchase + totals.solution + totals.refund;

                              return (
                                <div key={product} className="border rounded-2xl overflow-hidden">
                                  <div className="bg-gray-50 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-6">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base sm:text-lg font-black">{product}</span>
                                      <button onClick={() => handleSalesDeleteProduct(product)} className="text-xs text-red-400 hover:text-red-600 ml-1" title="품목 삭제">&times;</button>
                                    </div>
                                    <span className="sm:ml-auto text-base sm:text-lg font-black" style={{color: profit >= 0 ? '#16a34a' : '#dc2626'}}>{profit.toLocaleString()}</span>
                                  </div>
                                  <div className="text-xs bg-gray-50 px-3 sm:px-4 pb-2 flex flex-wrap gap-2 sm:gap-4 text-gray-400 font-bold">
                                    <span>공급가 {totals.supplyPrice.toLocaleString()}</span>
                                    <span>마진 {totals.totalMargin.toLocaleString()}</span>
                                    <span>수량 {totals.quantity}</span>
                                    <span>광고비 {totals.adCost.toLocaleString()}</span>
                                    <span>가구매 {totals.housePurchase.toLocaleString()}{(hpCountTotal.빈박 + hpCountTotal.실배) > 0 ? ` (빈박${hpCountTotal.빈박}개/실배${hpCountTotal.실배}개)` : ''}</span>
                                    {totals.refund !== 0 && <span>반품 {totals.refund.toLocaleString()}</span>}
                                    <span>솔룻 {totals.solution.toLocaleString()}</span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-center min-w-[520px]">
                                      <thead className="bg-gray-100 text-gray-500 font-bold">
                                        <tr>
                                          <th className="py-1.5 w-6"></th>
                                          <th className="py-1.5 px-2 sm:px-3">날짜</th>
                                          <th className="py-1.5 px-2 sm:px-3">공급가</th>
                                          <th className="py-1.5 px-2 sm:px-3">마진</th>
                                          <th className="py-1.5 px-1">수량</th>
                                          <th className="py-1.5 px-2">광고비</th>
                                          <th className="py-1.5 px-2 min-w-[130px]">가구매</th>
                                          <th className="py-1.5 px-2">반품</th>
                                          <th className="py-1.5 px-1">솔룻</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entries.map(entry => (
                                          <tr key={entry.id} className="border-t hover:bg-gray-50">
                                            <td className="py-1 px-1">
                                              <button onClick={() => handleSalesDeleteRow(entry)} className="text-red-300 hover:text-red-500 text-xs">&times;</button>
                                            </td>
                                            <td className="py-1 px-3">
                                              <input type="text" className="w-24 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none text-gray-600"
                                                defaultValue={entry.date} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => { const v = e.target.value; if (v !== entry.date) salesUpdate(entry.id, 'date', v); }} />
                                            </td>
                                            <td className="py-1 px-3">
                                              <input type="number" className="w-20 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                defaultValue={entry.supplyPrice || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'supplyPrice', Number(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-1 px-3">
                                              <input type="number" className="w-20 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                defaultValue={entry.totalMargin || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'totalMargin', Number(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-1 px-1">
                                              <input type="number" className="w-14 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                defaultValue={entry.quantity || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'quantity', Number(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-1 px-2">
                                              <input type="number" className="w-16 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                defaultValue={entry.adCost || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'adCost', Number(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-1 px-2">
                                              <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                                <input type="number" className="w-16 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                  defaultValue={entry.housePurchase || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'housePurchase', Number(e.target.value) || 0)} />
                                                {hpCountByDate[entry.date] && (hpCountByDate[entry.date].빈박 + hpCountByDate[entry.date].실배) > 0 ? (
                                                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                                    {[hpCountByDate[entry.date].빈박 > 0 && `빈박${hpCountByDate[entry.date].빈박}`, hpCountByDate[entry.date].실배 > 0 && `실배${hpCountByDate[entry.date].실배}`].filter(Boolean).join('/')}
                                                  </span>
                                                ) : null}
                                              </div>
                                            </td>
                                            <td className="py-1 px-2">
                                              <input type="number" className="w-16 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                defaultValue={entry.refund || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'refund', Number(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-1 px-1">
                                              <input type="number" className="w-14 text-center bg-transparent border-b border-transparent focus:border-gray-400 outline-none"
                                                defaultValue={entry.solution || ''} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => salesUpdate(entry.id, 'solution', Number(e.target.value) || 0)} />
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      {entries.length > 1 && (
                                        <tfoot>
                                          <tr className="border-t-2 border-gray-300 bg-gray-50 font-black text-gray-700">
                                            <td></td>
                                            <td className="py-1.5 px-2 sm:px-3 text-gray-400 text-[10px]">총계</td>
                                            <td className="py-1.5 px-2 sm:px-3">{totals.supplyPrice ? totals.supplyPrice.toLocaleString() : '-'}</td>
                                            <td className="py-1.5 px-2 sm:px-3">{totals.totalMargin ? totals.totalMargin.toLocaleString() : '-'}</td>
                                            <td className="py-1.5 px-1">{totals.quantity ? totals.quantity.toLocaleString() : '-'}</td>
                                            <td className="py-1.5 px-2">{totals.adCost ? totals.adCost.toLocaleString() : '-'}</td>
                                            <td className="py-1.5 px-2">{totals.housePurchase ? totals.housePurchase.toLocaleString() : '-'}</td>
                                            <td className="py-1.5 px-2">{totals.refund ? totals.refund.toLocaleString() : '-'}</td>
                                            <td className="py-1.5 px-1">{totals.solution ? totals.solution.toLocaleString() : '-'}</td>
                                          </tr>
                                        </tfoot>
                                      )}
                                    </table>
                                  </div>
                                  <div className="p-2 text-center">
                                    <button onClick={() => handleSalesAddRow(product)} className="text-xs text-gray-400 hover:text-gray-600">+ 행 추가</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </section>
              ) : adminTab === 'productPrices' ? (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl p-8 animate-in slide-in-from-right-10 duration-500">
                  <h2 className="text-xl font-black text-gray-900 mb-6">품목금액</h2>

                  {/* ===== 가구매비용계산기 ===== */}
                  <div className="mb-8">
                    <h3 className="text-base font-black text-gray-900 mb-4">가구매비용계산기</h3>
                    <div className="bg-gray-50 rounded-2xl p-5 space-y-4">

                      {/* 공식 편집 */}
                      <div className="space-y-3">
                        {/* 빈박 */}
                        <div>
                          <p className="text-[10px] font-black text-gray-400 mb-2">빈박 단위비용</p>
                          <div className="flex flex-wrap gap-3 items-end">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 mb-1">기본 수수료</label>
                              <input
                                type="number"
                                value={hpFormulaEdit.baseFee}
                                onChange={e => setHpFormulaEdit(f => ({ ...f, baseFee: Number(e.target.value) || 0 }))}
                                className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-center outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 mb-1">판매가 비율 (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={Math.round(hpFormulaEdit.supplyPriceRate * 10000) / 100}
                                onChange={e => setHpFormulaEdit(f => ({ ...f, supplyPriceRate: (Number(e.target.value) || 0) / 100 }))}
                                className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-center outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 mb-1">기타 비용</label>
                              <input
                                type="number"
                                value={hpFormulaEdit.extraFee}
                                onChange={e => setHpFormulaEdit(f => ({ ...f, extraFee: Number(e.target.value) || 0 }))}
                                className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-center outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                        {/* 실배 */}
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-[10px] font-black text-orange-400">실배 단위비용</p>
                            <div
                              onClick={() => setHpFormulaEdit(f => ({ ...f, silbaeAddSupply: !f.silbaeAddSupply }))}
                              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${hpFormulaEdit.silbaeAddSupply ? 'bg-orange-400' : 'bg-gray-300'}`}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${hpFormulaEdit.silbaeAddSupply ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                          </div>
                          {hpFormulaEdit.silbaeAddSupply && (
                            <div className="flex flex-wrap gap-3 items-end">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">판매가 비율 (%)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={Math.round((hpFormulaEdit.silbaeRate ?? 0.12) * 10000) / 100}
                                  onChange={e => setHpFormulaEdit(f => ({ ...f, silbaeRate: (Number(e.target.value) || 0) / 100 }))}
                                  className="w-24 px-3 py-2 bg-white border border-orange-200 rounded-xl text-sm font-bold text-center outline-none focus:border-orange-400"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            setHpFormulaSaving(true);
                            await updateSettings({ ...settings, hpFormula: hpFormulaEdit });
                            setHpFormulaSaving(false);
                          }}
                          className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                        >
                          {hpFormulaSaving ? '저장 중...' : '저장'}
                        </button>
                      </div>

                      {/* 공식 미리보기 */}
                      <p className="text-[11px] text-gray-400 font-bold">
                        빈박 = round({hpFormulaEdit.extraFee.toLocaleString()} + 판매가 × {(hpFormulaEdit.supplyPriceRate * 100).toFixed(2)}% + {hpFormulaEdit.baseFee.toLocaleString()})
                        {hpFormulaEdit.silbaeAddSupply && <span className="text-orange-400">　／　실배 = 공급가 + 판매가 × {((hpFormulaEdit.silbaeRate ?? 0.12) * 100).toFixed(2)}%</span>}
                      </p>

                      {/* 품목별 단위비용 미리보기 */}
                      {productPrices.length > 0 && (() => {
                        const rows = [...productPrices]
                          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
                          .map(p => {
                            const sellPrice = p.sellingPrice || p.price || 0;
                            const sellPriceNC = p.sellingPriceNoCoupon || p.priceNoCoupon || 0;
                            const supPrice = p.supplyPrice || (sellPrice - 1000);
                            if (sellPrice <= 0) return null;
                            const base = Math.round(hpFormulaEdit.extraFee + sellPrice * hpFormulaEdit.supplyPriceRate + hpFormulaEdit.baseFee);
                            const baseNC = sellPriceNC > 0 ? Math.round(hpFormulaEdit.extraFee + sellPriceNC * hpFormulaEdit.supplyPriceRate + hpFormulaEdit.baseFee) : null;
                            const silbae = hpFormulaEdit.silbaeAddSupply ? Math.round(supPrice + sellPrice * (hpFormulaEdit.silbaeRate ?? 0.12)) : null;
                            const silbaeNC = (hpFormulaEdit.silbaeAddSupply && sellPriceNC > 0) ? Math.round(supPrice + sellPriceNC * (hpFormulaEdit.silbaeRate ?? 0.12)) : null;
                            return { name: p.name, supPrice, base, baseNC, silbae, silbaeNC };
                          })
                          .filter(Boolean) as { name: string; supPrice: number; base: number; baseNC: number | null; silbae: number | null; silbaeNC: number | null }[];
                        if (rows.length === 0) return null;
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-center mt-2">
                              <thead className="bg-white text-gray-400 font-bold">
                                <tr>
                                  <th className="py-1.5 px-3 text-left rounded-tl-xl">품목명</th>
                                  <th className="py-1.5 px-3">공급가</th>
                                  <th className="py-1.5 px-3">빈박단위비용<br/><span className="font-normal text-[10px]">쿠폰적용</span></th>
                                  <th className={`py-1.5 px-3 text-blue-400${!hpFormulaEdit.silbaeAddSupply ? " rounded-tr-xl" : ""}`}>빈박단위비용<br/><span className="font-normal text-[10px]">쿠폰미적용</span></th>
                                  {hpFormulaEdit.silbaeAddSupply && <th className="py-1.5 px-3 text-orange-400 border-l-2 border-gray-100">실배단위비용<br/><span className="font-normal text-[10px]">쿠폰적용</span></th>}
                                  {hpFormulaEdit.silbaeAddSupply && <th className="py-1.5 px-3 text-orange-300 rounded-tr-xl">실배단위비용<br/><span className="font-normal text-[10px]">쿠폰미적용</span></th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 font-bold">
                                {rows.map(r => (
                                  <tr key={r.name} className="bg-white hover:bg-gray-50">
                                    <td className="py-1.5 px-3 text-left text-gray-700">{r.name}</td>
                                    <td className="py-1.5 px-3 text-gray-400">{r.supPrice.toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-gray-700">{r.base.toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-blue-500">{r.baseNC != null ? r.baseNC.toLocaleString() : '-'}</td>
                                    {hpFormulaEdit.silbaeAddSupply && <td className="py-1.5 px-3 text-orange-500 border-l-2 border-gray-100">{r.silbae!.toLocaleString()}</td>}
                                    {hpFormulaEdit.silbaeAddSupply && <td className="py-1.5 px-3 text-orange-400">{r.silbaeNC != null ? r.silbaeNC.toLocaleString() : '-'}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex gap-2 mb-8 items-end bg-gray-50 p-6 rounded-2xl">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-400 mb-1">품목명</label>
                      <input
                        type="text"
                        value={newProductPrice.name}
                        onChange={(e) => setNewProductPrice({ ...newProductPrice, name: e.target.value })}
                        className="w-full px-4 py-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none focus:border-blue-500 transition-all"
                        placeholder="예: 포기김치"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-400 mb-1">가격</label>
                      <input
                        type="number"
                        value={newProductPrice.price || ''}
                        onChange={(e) => setNewProductPrice({ ...newProductPrice, price: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none focus:border-blue-500 transition-all"
                        placeholder="예: 22290"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!newProductPrice.name || !newProductPrice.price) return alert("품목명과 가격을 입력해주세요.");
                        await addDoc(collection(db, getCol('productPrices', colPrefix)), { name: newProductPrice.name, price: newProductPrice.price });
                        setNewProductPrice({ name: '', price: 0 });
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                      추가
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-center">
                      <thead className="bg-gray-100 text-gray-500 font-bold">
                        <tr>
                          <th className="py-1.5 px-3 rounded-tl-xl">No.</th>
                          <th className="py-1.5 px-3 text-left">품목명</th>
                          <th className="py-1.5 px-3">페이백<br/><span className="font-normal text-[10px]">쿠폰적용</span></th>
                          <th className="py-1.5 px-3">페이백<br/><span className="font-normal text-[10px]">쿠폰미적용</span></th>
                          <th className="py-1.5 px-3 text-gray-400">물건값</th>
                          <th className="py-1.5 px-3 text-gray-400">판매가<br/><span className="font-normal text-[10px]">쿠폰적용</span></th>
                          <th className="py-1.5 px-3 text-gray-400">판매가<br/><span className="font-normal text-[10px]">쿠폰미적용</span></th>
                          <th className="py-1.5 px-3 text-gray-400">마진</th>
                          <th className="py-1.5 px-3 rounded-tr-xl w-24">관리</th>
                        </tr>
                      </thead>
                      <tbody className="font-bold divide-y divide-gray-100">
                        {[...productPrices].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).map((price, idx) => (
                          <tr key={price.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-1 px-3 text-gray-300">{idx + 1}</td>
                            <td className="py-1 px-3 text-left">
                              <input
                                type="text"
                                defaultValue={price.name}
                                key={`name-${price.id}-${price.name}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => { if (e.target.value !== price.name) updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { name: e.target.value }); }}
                                className="w-full bg-transparent outline-none font-bold text-gray-900 border-b border-transparent focus:border-blue-500 transition-colors"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <input
                                type="number"
                                defaultValue={price.price || ''}
                                key={`price-${price.id}-${price.price}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { price: Number(e.target.value) || 0 })}
                                className="w-full bg-transparent outline-none text-blue-600 font-bold text-center border-b border-transparent focus:border-blue-500 transition-colors"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <input
                                type="number"
                                defaultValue={price.priceNoCoupon || ''}
                                key={`priceNoCoupon-${price.id}-${price.priceNoCoupon}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { priceNoCoupon: Number(e.target.value) || 0 })}
                                className="w-full bg-transparent outline-none text-blue-600 font-bold text-center border-b border-transparent focus:border-blue-500 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <input
                                type="number"
                                defaultValue={price.supplyPrice || ''}
                                key={`supply-${price.id}-${price.supplyPrice}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { supplyPrice: Number(e.target.value) || 0 })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <input
                                type="number"
                                defaultValue={price.sellingPrice || ''}
                                key={`selling-${price.id}-${price.sellingPrice}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { sellingPrice: Number(e.target.value) || 0 })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <input
                                type="number"
                                defaultValue={price.sellingPriceNoCoupon || ''}
                                key={`sellingNoCoupon-${price.id}-${price.sellingPriceNoCoupon}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { sellingPriceNoCoupon: Number(e.target.value) || 0 })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <input
                                type="number"
                                defaultValue={price.margin || ''}
                                key={`margin-${price.id}-${price.margin}`}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => updateDoc(doc(db, getCol('productPrices', colPrefix), price.id), { margin: Number(e.target.value) || 0 })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="py-1 px-3">
                              <button
                                onClick={async () => {
                                  if (window.confirm("삭제하시겠습니까?")) {
                                    await deleteDoc(doc(db, getCol('productPrices', colPrefix), price.id));
                                  }
                                }}
                                className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-100 transition-all"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                        {productPrices.length === 0 && (
                          <tr><td colSpan={9} className="p-16 text-gray-300">등록된 품목금액이 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                </section>
              ) : (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl animate-in slide-in-from-right-10 duration-500">
                  <div className="p-4 md:px-6 bg-white border-b sticky left-0 z-30 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="hidden md:block text-xl font-black text-gray-900">구매목록</h2>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="검색 (이름, 주문번호...)"
                          className={`pl-3 pr-8 py-2 rounded-xl text-sm font-black outline-none border-2 w-48 transition-all duration-200 ${manualSearch ? 'bg-yellow-50 border-yellow-400' : 'bg-white border-gray-300'}`}
                          value={manualSearch}
                          onChange={e => setManualSearch(e.target.value)}
                        />
                        {manualSearch && (
                          <button
                            onClick={() => { setManualSearch(''); setDebouncedManualSearch(''); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 hover:bg-red-400 text-white text-[10px] font-black transition-colors"
                          >✕</button>
                        )}
                      </div>
                      <div className="hidden md:flex gap-1.5 items-center">
                        <button onClick={() => addMoreRows(10)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg font-bold text-[11px]">+10줄</button>
                        <button onClick={deleteEmptyRows} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg font-bold text-[11px] hover:bg-gray-200">빈행삭제</button>
                        {bizInfo?.accountInfo && (
                        <button
                          onClick={async () => {
                            if (selectedManualIds.size === 0) { alert('행을 먼저 선택해주세요.'); return; }
                            if (!window.confirm(`${selectedManualIds.size}건의 계좌번호를 ${bizInfo.accountInfo}(으)로 변경하시겠습니까?`)) return;
                            try {
                              const batch = writeBatch(db);
                              selectedManualIds.forEach(id => {
                                batch.update(doc(db, getCol('manualEntries', colPrefix), id), { accountNumber: bizInfo.accountInfo });
                              });
                              await batch.commit();
                              alert('변경되었습니다.');
                            } catch (e) { console.error(e); alert('오류: ' + e); }
                          }}
                          className="px-3 py-1.5 bg-purple-500 text-white rounded-lg font-bold text-[11px] hover:bg-purple-600"
                        >계좌일괄</button>
                        )}
                        <button onClick={insertRowAfterSelected} className="px-3 py-1.5 bg-green-500 text-white rounded-lg font-bold text-[11px] hover:bg-green-600">행삽입</button>
                        <button onClick={() => { if (selectedManualIds.size === 0) { alert('행을 먼저 선택해주세요.'); return; } deleteSelectedManualEntries(); }} className="px-3 py-1.5 bg-red-500 text-white rounded-lg font-bold text-[11px] hover:bg-red-600">삭제</button>
                      </div>
                      <div className="hidden md:flex gap-1 items-center ml-auto">
                        {undoStack.length > 0 && (
                          <button onClick={handleUndo} className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200" title="실행취소"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg></button>
                        )}
                        {redoStack.length > 0 && (
                          <button onClick={handleRedo} className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200" title="다시실행"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4m4 4l-4 4" /></svg></button>
                        )}
                      </div>
                    </div>
                    <div className={`hidden md:flex gap-1.5 items-center rounded-xl px-3 py-1.5 border ${selectedManualIds.size > 0 ? 'bg-blue-50 border-blue-200' : 'bg-transparent border-transparent pointer-events-none invisible'}`}>
                        <span className="text-[11px] font-black text-blue-600 mr-1">{selectedManualIds.size > 0 ? `${selectedManualIds.size}개 선택` : '\u00A0'}</span>
                        <button onClick={() => {
                          const selected = manualEntries.filter(e => selectedManualIds.has(e.id));
                          const text = selected.map(e => `${e.name2 || ''}\t${e.orderNumber || ''}`).join('\n');
                          navigator.clipboard.writeText(text).then(() => alert(`${selected.length}건 복사 완료`));
                        }} className="px-2.5 py-1 bg-white text-blue-600 rounded-lg font-bold text-[11px] hover:bg-blue-100 border border-blue-200">복사</button>
                        <button onClick={(e) => { e.stopPropagation(); setProductPicker({ x: e.clientX, y: e.clientY }); }} className="px-2.5 py-1 bg-white text-indigo-600 rounded-lg font-bold text-[11px] hover:bg-indigo-50 border border-indigo-200">품목일괄</button>
                        <button onClick={handleReservationComplete} className="px-2.5 py-1 bg-pink-500 text-white rounded-lg font-bold text-[11px] hover:bg-pink-600">예약완료</button>
                        <button onClick={handleReservationCancel} className="px-2.5 py-1 bg-white text-pink-500 rounded-lg font-bold text-[11px] hover:bg-pink-50 border border-pink-200">예약취소</button>
                        <button onClick={downloadManualCsv} className="px-2.5 py-1 bg-white text-green-600 rounded-lg font-bold text-[11px] hover:bg-green-50 border border-green-200">엑셀</button>
                        <span className="w-px h-4 bg-blue-200 mx-0.5"></span>
                        <button onClick={(e) => { e.stopPropagation(); setColorPicker({ type: 'text', x: e.clientX, y: e.clientY }); }} className="px-2.5 py-1 bg-white text-purple-600 rounded-lg font-bold text-[11px] hover:bg-purple-50 border border-purple-200">폰트색</button>
                        <button onClick={(e) => { e.stopPropagation(); setColorPicker({ type: 'bg', x: e.clientX, y: e.clientY }); }} className="px-2.5 py-1 bg-white text-yellow-700 rounded-lg font-bold text-[11px] hover:bg-yellow-50 border border-yellow-200">행색상</button>
                        <button onClick={async () => {
                          if (selectedManualIds.size === 0) return;
                          const batch = writeBatch(db);
                          const selected = manualEntries.filter(e => selectedManualIds.has(e.id));
                          const hasAnyBorder = selected.some(e => e.bottomBorder);
                          selectedManualIds.forEach(id => {
                            batch.update(doc(db, getCol('manualEntries', colPrefix), id), { bottomBorder: !hasAnyBorder });
                          });
                          await batch.commit();
                        }} className="px-2.5 py-1 bg-white text-gray-700 rounded-lg font-bold text-[11px] hover:bg-gray-100 border border-gray-300">경계선</button>
                        <span className="w-px h-4 bg-blue-200 mx-0.5"></span>
                        <button onClick={() => setPlatformConfigModal(true)} className="px-2 py-1 bg-white text-teal-600 rounded-lg font-bold text-[11px] hover:bg-teal-50 border border-teal-200" title="플랫폼 설정">🏷</button>
                        <button onClick={() => setTemplateListModal(true)} className="px-2 py-1 bg-white text-gray-500 rounded-lg font-bold text-[11px] hover:bg-gray-100 border border-gray-300" title="양식설정">⚙</button>
                        <button onClick={() => setSelectedManualIds(new Set())} className="ml-auto px-2 py-1 text-gray-400 hover:text-gray-600 text-[11px]">✕ 해제</button>
                      </div>
                    {/* 마스터 주문서 업로드 & 매칭 현황 패널 */}
                    <div className={`rounded-xl border text-xs ${masterSheets.length > 0 ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                        <span className="font-bold text-gray-600">📋 마스터 주문서</span>
                        {masterSheets.map((sheet, idx) => {
                          const matchTargets = selectedManualIds.size > 0
                            ? manualEntries.filter(e => selectedManualIds.has(e.id))
                            : manualEntries;
                          const matched = matchTargets.filter(e => sheet.orderMap.has(e.orderNumber)).length;
                          return (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full font-bold">
                              {sheet.platformName} ({sheet.total}건)
                              <span className="text-green-600">✓{matched}</span>
                              <button onClick={() => setMasterSheets(prev => prev.filter((_, i) => i !== idx))} className="ml-0.5 text-teal-400 hover:text-red-500 font-bold">✕</button>
                            </span>
                          );
                        })}
                        <select
                          value={masterUploadPlatformId}
                          onChange={e => setMasterUploadPlatformId(e.target.value)}
                          className="px-2 py-0.5 border border-gray-300 rounded text-[11px] text-gray-600 bg-white"
                        >
                          <option value="">플랫폼 선택</option>
                          {allPlatformConfigs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <label className="px-2.5 py-1 bg-teal-500 text-white rounded-lg font-bold text-[11px] hover:bg-teal-600 cursor-pointer">
                          +업로드
                          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (!masterUploadPlatformId) { alert('플랫폼을 먼저 선택해주세요.'); e.target.value = ''; return; }
                            const platform = allPlatformConfigs.find(p => p.id === masterUploadPlatformId);
                            if (!platform) { e.target.value = ''; return; }
                            try {
                              const result = await parseMasterSheet(file, platform);
                              setMasterSheets(prev => {
                                const filtered = prev.filter(s => s.platformId !== platform.id);
                                return [...filtered, { platformId: platform.id, platformName: platform.name, orderMap: result.orderMap, total: result.total, allRows: result.allRows, headerRowIndex: result.headerRowIndex, trackingColIndex: result.trackingColIndex, originalFileName: file.name }];
                              });
                              setMasterUnmatchedExpanded(false);
                            } catch { alert('파일 파싱 중 오류가 발생했습니다.'); }
                            e.target.value = '';
                          }} />
                        </label>
                        {masterSheets.length > 0 && (
                          <>
                            {exportTemplates.map(tpl => {
                              const colorMap: Record<string, string> = { red: 'bg-red-500 hover:bg-red-600', orange: 'bg-orange-500 hover:bg-orange-600', blue: 'bg-blue-500 hover:bg-blue-600', green: 'bg-green-500 hover:bg-green-600', purple: 'bg-purple-500 hover:bg-purple-600', pink: 'bg-pink-500 hover:bg-pink-600', gray: 'bg-gray-500 hover:bg-gray-600' };
                              const combinedMap = (() => { const m = new Map<string, Record<string, string>>(); masterSheets.forEach(s => s.orderMap.forEach((v, k) => m.set(k, v))); return m; })();
                              const matchedSheet = masterSheets.find(s => s.platformId === tpl.id) ?? masterSheets[0];
                              return (
                                <button key={tpl.id} onClick={async () => {
                                  const XLSX = await import('xlsx');
                                  const selected = manualEntries.filter(e => selectedManualIds.has(e.id));
                                  const base = selected.length > 0 ? selected : manualEntries;
                                  const toDownload = base.filter(e => combinedMap.has(e.orderNumber));
                                  if (toDownload.length === 0) { alert('마스터 주문서와 매칭된 항목이 없습니다.'); return; }
                                  const headers = tpl.columns.map(c => c.header);
                                  const rows = toDownload.map(e => {
                                    const masterRow = matchedSheet.orderMap.get(e.orderNumber) ?? combinedMap.get(e.orderNumber);
                                    return tpl.columns.map(c => getExportCellValue(e, c, masterRow));
                                  });
                                  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                                  const wb = XLSX.utils.book_new();
                                  XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName);
                                  const dateStr = toLocalDateStr().replace(/-/g,'');
                                  const bizPrefix = selectedBiz === 'zoe' ? '조에' : '안군';
                                  const fileName = tpl.id === 'delivery'
                                    ? `${bizPrefix}_롯데대행 운송장_${dateStr}.xlsx`
                                    : `${tpl.filePrefix}_${dateStr}.xlsx`;
                                  XLSX.writeFile(wb, fileName);
                                }} className={`px-2.5 py-1 text-white rounded-lg font-bold text-[11px] ${colorMap[tpl.color] || 'bg-gray-500 hover:bg-gray-600'}`}>{tpl.name} 📋</button>
                              );
                            })}
                            <button onClick={() => { setMasterSheets([]); setMasterUnmatchedExpanded(false); }} className="ml-auto text-teal-500 hover:text-red-500 font-bold text-[11px]">전체해제</button>
                          </>
                        )}
                        {allPlatformConfigs.length === 0 && <span className="text-gray-400">플랫폼 설정(🏷)을 먼저 해주세요</span>}
                      </div>
                    </div>
                    {/* 운송장 입력 섹션 */}
                    {masterSheets.length > 0 && (
                      <div className="rounded-xl border bg-orange-50 border-orange-200 text-xs">
                        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                          <span className="font-bold text-orange-700">📦 운송장 입력</span>
                          {waybillSources.map((src, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">
                              {src.name} ({src.count}건)
                              <button onClick={() => {
                                const newSources = waybillSources.filter((_, i) => i !== idx);
                                setWaybillSources(newSources);
                                // rebuild waybillMap from remaining sources by re-upload is not feasible;
                                // just clear all if removing any source
                                setWaybillMap(new Map());
                                setWaybillSources([]);
                              }} className="ml-0.5 text-orange-400 hover:text-red-500 font-bold">✕</button>
                            </span>
                          ))}
                          <label className="px-2.5 py-1 bg-orange-500 text-white rounded-lg font-bold text-[11px] hover:bg-orange-600 cursor-pointer">
                            +운송장 파일
                            <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={async (e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (!files.length) return;
                              const newMap = new Map(waybillMap);
                              const newSources = [...waybillSources];
                              for (const file of files) {
                                try {
                                  const result = await parseWaybillFile(file);
                                  result.trackingMap.forEach((v, k) => newMap.set(k, v));
                                  newSources.push({ name: file.name.replace(/\.[^.]+$/, ''), count: result.count });
                                } catch (err) {
                                  alert(`[${file.name}] ${err instanceof Error ? err.message : '파싱 오류'}`);
                                }
                              }
                              setWaybillMap(newMap);
                              setWaybillSources(newSources);
                              e.target.value = '';
                            }} />
                          </label>
                          {waybillSources.length > 0 && (
                            <span className="text-orange-600 font-bold">합계 {waybillMap.size}건 매핑됨</span>
                          )}
                          {waybillSources.length > 0 && (
                            <button onClick={() => { setWaybillMap(new Map()); setWaybillSources([]); }} className="ml-auto text-orange-400 hover:text-red-500 font-bold text-[11px]">초기화</button>
                          )}
                        </div>
                        {waybillMap.size > 0 && (
                          <div className="border-t border-orange-200 px-3 py-2 flex items-center gap-2 flex-wrap">
                            <span className="text-orange-600 font-bold text-[11px]">원본 주문서 다운로드:</span>
                            {masterSheets.map((sheet, idx) => {
                              const platform = allPlatformConfigs.find(p => p.id === sheet.platformId);
                              const orderNumColName = platform?.orderNumColName ?? '';
                              const headerRow = sheet.allRows[sheet.headerRowIndex] ?? [];
                              const orderColIdx = headerRow.findIndex(h => String(h) === orderNumColName);
                              let trackColIdx = sheet.trackingColIndex;
                              const dataRows = sheet.allRows.slice(sheet.headerRowIndex + 1).filter(row => {
                                const orderNum = String(row[orderColIdx] ?? '').trim();
                                return orderNum && waybillMap.has(orderNum);
                              });
                              const filledCount = dataRows.length;
                              return (
                                <button key={idx} onClick={async () => {
                                  if (filledCount === 0) { alert(`${sheet.platformName}: 운송장과 매칭된 주문이 없습니다.`); return; }
                                  const XLSX = await import('xlsx');
                                  const newRows: string[][] = [headerRow.map(String)];
                                  let actualTrackColIdx = trackColIdx;
                                  if (actualTrackColIdx === -1) {
                                    newRows[0] = [...newRows[0], '운송장번호'];
                                    actualTrackColIdx = newRows[0].length - 1;
                                  }
                                  const carrierColIdx = newRows[0].findIndex(h => h === '택배사');
                                  sheet.allRows.slice(sheet.headerRowIndex + 1).forEach(row => {
                                    const orderNum = String(row[orderColIdx] ?? '').trim();
                                    if (!orderNum || !waybillMap.has(orderNum)) return;
                                    const newRow = row.map(String);
                                    if (actualTrackColIdx === newRows[0].length - 1 && trackColIdx === -1) {
                                      newRow.push(waybillMap.get(orderNum) ?? '');
                                    } else {
                                      newRow[actualTrackColIdx] = waybillMap.get(orderNum) ?? '';
                                    }
                                    if (carrierColIdx !== -1) newRow[carrierColIdx] = '롯데택배';
                                    newRows.push(newRow);
                                  });
                                  const ws = XLSX.utils.aoa_to_sheet(newRows);
                                  const wb = XLSX.utils.book_new();
                                  XLSX.utils.book_append_sheet(wb, ws, sheet.platformName);
                                  const bizPfx = selectedBiz === 'zoe' ? '조에' : '안군';
                                  XLSX.writeFile(wb, `${bizPfx}_롯데대행 운송장_${toLocalDateStr().replace(/-/g,'')}.xlsx`);
                                }} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-[11px]">
                                  ⬇ {sheet.platformName} ({filledCount}건)
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      {renderDateRangePicker(
                        manualViewDateStart, manualViewDateEnd,
                        setManualViewDateStart, setManualViewDateEnd,
                        manualCalOpen, setManualCalOpen,
                        manualCalMonth, setManualCalMonth,
                        manualEntries.reduce((acc, e) => {
                          if (e.date) acc[e.date] = (acc[e.date] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      )}
                    </div>
                  </div>
                  {selectedManualIds.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-5 py-2.5 rounded-full shadow-lg shadow-blue-600/30 text-sm font-bold animate-bounce-in pointer-events-none">
                      {selectedManualIds.size}개 선택됨
                    </div>
                  )}
                  {productPicker && (
                    <div className="product-picker-popup fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-200 p-3" style={{ left: Math.min(productPicker.x, window.innerWidth - 240), top: productPicker.y + 8, width: 220 }}>
                      <div className="text-[11px] font-bold text-gray-500 mb-2">품목 일괄변경 ({selectedManualIds.size}건)</div>
                      <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                        <button onClick={() => applyBulkProduct('')} className="text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-gray-400 hover:bg-gray-100 border border-gray-200">(비우기)</button>
                        {productPrices.map(p => (
                          <button
                            key={p.id}
                            onClick={() => applyBulkProduct(p.name)}
                            className="text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200"
                          >
                            {p.name}
                            {p.price > 0 && <span className="ml-1 text-gray-400 font-normal">{p.price.toLocaleString()}원</span>}
                          </button>
                        ))}
                        {productPrices.length === 0 && (
                          <div className="text-[11px] text-gray-400 px-2 py-3 text-center">등록된 품목이 없습니다.</div>
                        )}
                      </div>
                    </div>
                  )}
                  {colorPicker && (
                    <div className="color-picker-popup fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-200 p-3" style={{ left: Math.min(colorPicker.x, window.innerWidth - 220), top: colorPicker.y + 8 }}>
                      <div className="text-[11px] font-bold text-gray-500 mb-2">{colorPicker.type === 'cell' ? '셀 폰트색' : colorPicker.type === 'text' ? '폰트 색상' : '행 배경색'}</div>
                      <div className="flex gap-2 flex-wrap" style={{ maxWidth: 200 }}>
                        {(colorPicker.type === 'text' || colorPicker.type === 'cell'
                          ? [
                              { name: '검정', value: '#000000' },
                              { name: '빨강', value: '#ef4444' },
                              { name: '파랑', value: '#3b82f6' },
                              { name: '초록', value: '#22c55e' },
                              { name: '보라', value: '#a855f7' },
                              { name: '주황', value: '#f97316' },
                              { name: '분홍', value: '#ec4899' },
                              { name: '회색', value: '#6b7280' },
                            ]
                          : [
                              { name: '없음', value: '' },
                              { name: '연노랑', value: '#fef9c3' },
                              { name: '연분홍', value: '#fce7f3' },
                              { name: '연초록', value: '#dcfce7' },
                              { name: '연파랑', value: '#dbeafe' },
                              { name: '연보라', value: '#f3e8ff' },
                              { name: '연주황', value: '#ffedd5' },
                            ]
                        ).map(c => (
                          <button
                            key={c.name}
                            title={c.name}
                            onClick={() => handleColorSelect(c.value)}
                            className="w-7 h-7 rounded-lg border-2 border-gray-200 hover:border-gray-400 hover:scale-110 transition-all flex items-center justify-center text-[9px]"
                            style={{ backgroundColor: c.value || '#fff' }}
                          >
                            {!c.value && '✕'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={tableWrapRef} className="overflow-auto relative scrollbar-hide" style={{ maxHeight: 'calc(100vh - 220px)' }}
                    onMouseUp={() => { isDraggingRef.current = false; handleCellMouseUp(); }}
                    onMouseLeave={() => { isDraggingRef.current = false; handleCellMouseUp(); }}
                    onMouseDown={(e) => {
                      const el = (e.target as HTMLElement).closest('[data-row][data-col]') as HTMLElement;
                      if (el) handleCellMouseDown(Number(el.dataset.row), Number(el.dataset.col));
                      else setCellSelection(null);
                    }}
                    onMouseOver={(e) => {
                      const el = (e.target as HTMLElement).closest('[data-row][data-col]') as HTMLElement;
                      if (el) handleCellMouseEnter(Number(el.dataset.row), Number(el.dataset.col));
                    }}
                  >
                    {cellSelection && (() => {
                      const minR = Math.min(cellSelection.startRow, cellSelection.endRow);
                      const maxR = Math.max(cellSelection.startRow, cellSelection.endRow);
                      const minC = Math.min(cellSelection.startCol, cellSelection.endCol);
                      const maxC = Math.max(cellSelection.startCol, cellSelection.endCol);
                      const s: string[] = [];
                      for (let r = minR; r <= maxR; r++)
                        for (let c = minC; c <= maxC; c++)
                          s.push(`[data-row="${r}"][data-col="${c}"]`);
                      return <style>{s.join(',') + `{background:rgba(0,113,227,0.15)!important;border-color:#0071E3!important}`}</style>;
                    })()}
                    <table className="excel-table w-full border-collapse md:min-w-[1100px] table-fixed text-center text-[12px]">
                      <thead className="sticky top-0 z-20 bg-white shadow-sm">
                        <tr className="text-[10px] font-semibold text-black bg-white">
                          <th className="py-0 px-0.5 w-8 sticky left-0 bg-white z-30 overflow-hidden">
                            <input type="checkbox" className="w-3 h-3 accent-blue-600"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const filtered = manualEntries.filter(entry => {
                                    if (!entry) return false;

                                    // 검색 시 동작: 날짜 필터 무시하고 전체 데이터 검색
                                    if (debouncedManualSearch) {
                                      const queries = debouncedManualSearch.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                                      const fields = [String(entry.name1 || ''), String(entry.name2 || ''), String(entry.orderNumber || ''), String(entry.product || ''), String(entry.accountNumber || '')].map(f => f.toLowerCase());
                                      return queries.some(q => fields.some(f => f.includes(q)));
                                    }

                                    // 일반 조회 시: 날짜 범위로 필터링
                                    if (manualViewDateStart !== 'all') {
                                      if (entry.date < manualViewDateStart || entry.date > manualViewDateEnd) return false;
                                    }

                                    return true;
                                  });

                                  // 정렬 적용 - tbody 로직과 동일하게
                                  if (sortConfig) {
                                    filtered.sort((a, b) => {
                                      const aVal = a[sortConfig.key] ?? '';
                                      const bVal = b[sortConfig.key] ?? '';
                                      if (typeof aVal === 'number' && typeof bVal === 'number') {
                                        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                                      }
                                      const aStr = String(aVal).toLowerCase();
                                      const bStr = String(bVal).toLowerCase();
                                      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
                                      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
                                      return 0;
                                    });
                                  }

                                  const visibleIds = filtered.slice(0, 200).map(e => e.id);
                                  setSelectedManualIds(new Set(visibleIds));
                                } else {
                                  setSelectedManualIds(new Set());
                                }
                              }}
                            />
                          </th>
                          <th className="py-0 px-0.5 overflow-hidden relative hidden md:table-cell" style={{ width: colWidths.photo + 'px', border: '1px solid #000' }}>사진<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('photo', e)} onDoubleClick={() => resetColWidth('photo')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.id + 'px' }} onClick={() => handleSort('id')}>순번 {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('id', e)} onDoubleClick={() => resetColWidth('id')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.count + 'px' }} onClick={() => handleSort('count')}>갯수 {sortConfig?.key === 'count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('count', e)} onDoubleClick={() => resetColWidth('count')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative" style={{ width: colWidths.product + 'px' }} onClick={() => handleSort('product')}>품목 {sortConfig?.key === 'product' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('product', e)} onDoubleClick={() => resetColWidth('product')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden relative" style={{ width: colWidths.coupon + 'px' }}>쿠폰<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('coupon', e)} onDoubleClick={() => resetColWidth('coupon')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative" style={{ width: colWidths.date + 'px' }} onClick={() => handleSort('date')}>날짜 {sortConfig?.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('date', e)} onDoubleClick={() => resetColWidth('date')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative" style={{ width: colWidths.name1 + 'px' }} onClick={() => handleSort('name1')}>이름1 {sortConfig?.key === 'name1' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('name1', e)} onDoubleClick={() => resetColWidth('name1')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative" style={{ width: colWidths.name2 + 'px' }} onClick={() => handleSort('name2')}>받는사람 {sortConfig?.key === 'name2' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('name2', e)} onDoubleClick={() => resetColWidth('name2')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.orderNumber + 'px' }} onClick={() => handleSort('orderNumber')}>주문번호 {sortConfig?.key === 'orderNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('orderNumber', e)} onDoubleClick={() => resetColWidth('orderNumber')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.address + 'px' }} onClick={() => handleSort('address')}>받는주소 {sortConfig?.key === 'address' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('address', e)} onDoubleClick={() => resetColWidth('address')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.memo + 'px' }} onClick={() => handleSort('memo')}>비고 {sortConfig?.key === 'memo' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('memo', e)} onDoubleClick={() => resetColWidth('memo')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative" style={{ width: colWidths.paymentAmount + 'px' }} onClick={() => handleSort('paymentAmount')}>결제금액 {sortConfig?.key === 'paymentAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('paymentAmount', e)} onDoubleClick={() => resetColWidth('paymentAmount')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.emergencyContact + 'px' }} onClick={() => handleSort('emergencyContact')}>연락처 {sortConfig?.key === 'emergencyContact' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('emergencyContact', e)} onDoubleClick={() => resetColWidth('emergencyContact')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.accountNumber + 'px' }} onClick={() => handleSort('accountNumber')}>계좌번호 {sortConfig?.key === 'accountNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('accountNumber', e)} onDoubleClick={() => resetColWidth('accountNumber')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden cursor-pointer hover:bg-gray-200 relative hidden md:table-cell" style={{ width: colWidths.trackingNumber + 'px' }} onClick={() => handleSort('trackingNumber')}>송장번호 {sortConfig?.key === 'trackingNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('trackingNumber', e)} onDoubleClick={() => resetColWidth('trackingNumber')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden text-blue-600 relative" style={{ width: colWidths.beforeDeposit + 'px' }}>입금전<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('beforeDeposit', e)} onDoubleClick={() => resetColWidth('beforeDeposit')} /></th>
                          <th className="py-0 px-0.5 overflow-hidden text-green-600 relative" style={{ width: colWidths.afterDeposit + 'px' }}>입금후<div className="col-resize-handle" onMouseDown={(e) => handleColResizeStart('afterDeposit', e)} onDoubleClick={() => resetColWidth('afterDeposit')} /></th>
                        </tr>
                      </thead>
                      <tbody className="text-[12px]">
                        {!manualEntriesLoaded ? (
                          <tr>
                            <td colSpan={17} className="p-16 text-center text-gray-400 font-bold">
                              로딩중입니다...
                            </td>
                          </tr>
                        ) : (() => {
                          const filtered = manualEntries.filter(entry => {
                            if (!entry) return false;

                            // 검색 시 동작: 날짜 필터 무시하고 전체 데이터 검색
                            if (debouncedManualSearch) {
                              const queries = debouncedManualSearch.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                              const fields = [String(entry.name1 || ''), String(entry.name2 || ''), String(entry.orderNumber || ''), String(entry.product || ''), String(entry.accountNumber || '')].map(f => f.toLowerCase());
                              return queries.some(q => fields.some(f => f.includes(q)));
                            }

                            // 일반 조회 시: 날짜 범위로 필터링
                            if (manualViewDateStart !== 'all') {
                              if (entry.date < manualViewDateStart || entry.date > manualViewDateEnd) return false;
                            }

                            return true;
                          });

                          // 정렬 적용
                          if (sortConfig) {
                            filtered.sort((a, b) => {
                              const aVal = a[sortConfig.key] ?? '';
                              const bVal = b[sortConfig.key] ?? '';
                              if (typeof aVal === 'number' && typeof bVal === 'number') {
                                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                              }
                              const aStr = String(aVal).toLowerCase();
                              const bStr = String(bVal).toLowerCase();
                              if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
                              if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
                              return 0;
                            });
                          }

                          const limited = filtered.slice(0, 200);
                          return (<>
                            {limited.map((entry, idx) => {
                              const isBlue = entry.afterDeposit;
                              const rowColor = isBlue ? 'text-blue-600' : '';
                              const isPink = entry.reservationComplete;
                              const textStyle = isBlue ? { color: '#2563eb' } : entry.textColor ? { color: entry.textColor } : {};
                              const rowStyle = {
                                ...textStyle,
                                ...(entry.rowBgColor ? { backgroundColor: entry.rowBgColor } : {}),
                                ...(entry.bottomBorder ? { borderBottom: '3px solid #000' } : {})
                              };
                              return (
                                <tr key={entry.id}
                                  style={rowStyle}
                                  className={`group hover:bg-blue-100 transition-colors ${!entry.rowBgColor && isBlue ? 'bg-blue-50/40' : ''}`}
                                >
                                  <td className="p-0 border border-gray-200 text-center sticky left-0 bg-white z-20 select-none cursor-pointer"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      isDraggingRef.current = true;
                                      dragActivatedRef.current = false;
                                      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
                                      dragStartIndexRef.current = idx;
                                      dragModeRef.current = selectedManualIds.has(entry.id) ? 'remove' : 'add';
                                      const next = new Set(selectedManualIds);
                                      dragModeRef.current === 'remove' ? next.delete(entry.id) : next.add(entry.id);
                                      setSelectedManualIds(next);
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isDraggingRef.current) return;
                                      if (!dragActivatedRef.current && dragStartPosRef.current) {
                                        const dx = e.clientX - dragStartPosRef.current.x;
                                        const dy = e.clientY - dragStartPosRef.current.y;
                                        if (dx * dx + dy * dy < 25) return;
                                        dragActivatedRef.current = true;
                                      }
                                      if (!dragActivatedRef.current) return;
                                      const start = Math.min(dragStartIndexRef.current, idx);
                                      const end = Math.max(dragStartIndexRef.current, idx);
                                      const next = new Set(selectedManualIds);
                                      for (let i = start; i <= end; i++) {
                                        if (limited[i]) {
                                          dragModeRef.current === 'remove' ? next.delete(limited[i].id) : next.add(limited[i].id);
                                        }
                                      }
                                      setSelectedManualIds(next);
                                    }}
                                  >
                                    <input type="checkbox" className="w-3 h-3 accent-blue-600 pointer-events-none"
                                      checked={selectedManualIds.has(entry.id)}
                                      readOnly
                                    />
                                  </td>
                                  <td className="p-0.5 border border-gray-200 hidden md:table-cell focus:outline focus:outline-2 focus:outline-blue-400 focus-within:outline focus-within:outline-2 focus-within:outline-blue-400 cursor-pointer relative"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleManualImageDrop(entry.id, e)}
                                    onPaste={(e) => handleManualImagePaste(entry.id, e)}
                                    onClick={(e) => {
                                      activePasteCellIdRef.current = entry.id;
                                      const ta = e.currentTarget.querySelector('textarea');
                                      if (ta) ta.focus();
                                      else (e.currentTarget as HTMLElement).focus();
                                    }}
                                    onBlur={(e) => {
                                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        if (activePasteCellIdRef.current === entry.id) activePasteCellIdRef.current = null;
                                      }
                                    }}
                                    tabIndex={0}
                                  >
                                    <textarea
                                      className="absolute opacity-0 w-0 h-0 p-0 m-0 border-0 overflow-hidden"
                                      style={{position:'absolute',top:0,left:0,pointerEvents:'none'}}
                                      onPaste={(e) => { e.stopPropagation(); handleManualImagePaste(entry.id, e); }}
                                      tabIndex={-1}
                                      aria-hidden="true"
                                    />
                                    <div className="relative h-5 w-5 mx-auto group/img">
                                      {entry.proofImage ? (
                                        <>
                                          <img src={entry.proofImage} onClick={() => openPreview(entry.proofImage)} className="w-full h-full object-cover border cursor-pointer" />
                                          {ocrLoadingIds.has(entry.id) ? (
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded">
                                              <div className="w-4 h-1 bg-gray-300 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-400 rounded-full animate-pulse" style={{width: '60%', animation: 'ocrProgress 1.5s ease-in-out infinite'}} />
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="absolute -top-1 -left-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                                              <span className="text-white text-[6px] font-bold">✓</span>
                                            </div>
                                          )}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); if (window.confirm('이미지를 삭제하시겠습니까?')) updateManualEntry(entry.id, 'proofImage', ''); }}
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"
                                          >&times;</button>
                                        </>
                                      ) : (
                                        <div className="cursor-pointer block w-full h-full" onDoubleClick={() => {
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.accept = 'image/*';
                                          input.onchange = (ev) => handleManualImageUpload(entry.id, ev as any);
                                          input.click();
                                        }}>
                                          <div className="w-full h-full bg-gray-50 border border-dashed border-gray-300 rounded flex items-center justify-center text-[8px] text-gray-400">V</div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-0.5 border border-gray-200 text-center text-gray-400 text-[10px] hidden md:table-cell">{idx + 1}</td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.count > 0 ? entry.count : '')} data-row={idx} data-col={0} defaultValue={entry.count > 0 ? entry.count : ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'count', idx, 0)} type="number" className={`excel-input ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'count')} /></td>
                                  <td className="p-0 border border-gray-200">
                                    <select data-row={idx} data-col={1}
                                      className={`excel-input ${rowColor} cursor-pointer`}
                                      value={entry.product}
                                      onChange={e => updateManualEntry(entry.id, 'product', e.target.value)}
                                      onKeyDown={(e) => handleKeyDown(e, idx, 1)}
                                    >
                                      <option value="">(선택)</option>
                                      {entry.product && !productPrices.some(p => p.name === entry.product) && (
                                        <option value={entry.product}>{entry.product} (미등록)</option>
                                      )}
                                      {productPrices.map(p => (
                                        <option key={p.id} value={p.name}>{p.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-0 border border-gray-200 text-center align-middle">
                                    <select
                                      className={`excel-input ${rowColor} cursor-pointer text-[10px]`}
                                      value={entry.couponApplied === false ? 'N' : 'Y'}
                                      onChange={e => updateManualEntry(entry.id, 'couponApplied', e.target.value === 'Y')}
                                    >
                                      <option value="Y">적용</option>
                                      <option value="N">미적용</option>
                                    </select>
                                  </td>
                                  <td className="p-0 border border-gray-200"><input ref={(el) => syncInputValue(el, entry.date ? entry.date.slice(2).replace(/-/g, '.') : '')} data-row={idx} data-col={2} defaultValue={entry.date ? entry.date.slice(2).replace(/-/g, '.') : ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'date', idx, 2)} type="text" placeholder="YY.MM.DD" className={`excel-input px-1 text-center ${rowColor}`} onFocus={(e) => e.target.select()} onBlur={(e) => handleCellBlur(e, entry, 'date')} /></td>
                                  <td className="p-0 border border-gray-200"><input ref={(el) => syncInputValue(el, entry.name1)} data-row={idx} data-col={3} defaultValue={entry.name1} onKeyDown={(e) => handleCellKeyDown(e, entry, 'name1', idx, 3)} type="text" className={`excel-input text-center ${rowColor}`} style={getCellColor(entry, 'name1') ? { color: getCellColor(entry, 'name1') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'name1')} onBlur={(e) => handleCellBlur(e, entry, 'name1')} /></td>
                                  <td className={`p-0 border border-gray-200 ${isPink ? 'bg-white' : ''}`}><input ref={(el) => syncInputValue(el, entry.name2)} data-row={idx} data-col={4} defaultValue={entry.name2} onKeyDown={(e) => handleCellKeyDown(e, entry, 'name2', idx, 4)} type="text" className={`excel-input text-center ${isPink ? 'font-black' : rowColor}`} style={getCellColor(entry, 'name2') ? { color: getCellColor(entry, 'name2') } : isPink ? { color: '#ff4da6' } : undefined} placeholder="받는사람" onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'name2')} onBlur={(e) => handleCellBlur(e, entry, 'name2')} /></td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.orderNumber)} data-row={idx} data-col={5} defaultValue={entry.orderNumber} onKeyDown={(e) => handleCellKeyDown(e, entry, 'orderNumber', idx, 5)} type="text" className={`excel-input text-center ${rowColor}`} style={getCellColor(entry, 'orderNumber') ? { color: getCellColor(entry, 'orderNumber') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'orderNumber')} onBlur={(e) => handleCellBlur(e, entry, 'orderNumber')} /></td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.address)} data-row={idx} data-col={6} defaultValue={entry.address} onKeyDown={(e) => handleCellKeyDown(e, entry, 'address', idx, 6)} type="text" className={`excel-input text-[11px] ${rowColor}`} style={getCellColor(entry, 'address') ? { color: getCellColor(entry, 'address') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'address')} onBlur={(e) => handleCellBlur(e, entry, 'address')} /></td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.memo)} data-row={idx} data-col={7} defaultValue={entry.memo} onKeyDown={(e) => handleCellKeyDown(e, entry, 'memo', idx, 7)} type="text" className={`excel-input text-[11px] font-normal ${rowColor}`} style={getCellColor(entry, 'memo') ? { color: getCellColor(entry, 'memo') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'memo')} onBlur={(e) => handleCellBlur(e, entry, 'memo')} /></td>
                                  <td className="p-0 border border-gray-200"><input ref={(el) => { if (el && document.activeElement !== el) { el.value = entry.paymentAmount ? entry.paymentAmount.toLocaleString() : ''; } }} data-row={idx} data-col={8} defaultValue={entry.paymentAmount ? entry.paymentAmount.toLocaleString() : ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'paymentAmount', idx, 8)} type="text" className={`excel-input text-center ${rowColor}`} style={getCellColor(entry, 'paymentAmount') ? { color: getCellColor(entry, 'paymentAmount') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'paymentAmount')} onFocus={(e) => { e.target.value = entry.paymentAmount ? String(entry.paymentAmount) : ''; e.target.select(); }} onBlur={(e) => { const raw = Number(e.target.value.replace(/,/g, '')) || 0; if (raw !== (entry.paymentAmount || 0)) updateManualEntry(entry.id, 'paymentAmount', raw); e.target.value = raw ? raw.toLocaleString() : ''; }} /></td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.emergencyContact)} data-row={idx} data-col={9} defaultValue={entry.emergencyContact} onKeyDown={(e) => handleCellKeyDown(e, entry, 'emergencyContact', idx, 9)} type="text" className={`excel-input ${rowColor}`} style={getCellColor(entry, 'emergencyContact') ? { color: getCellColor(entry, 'emergencyContact') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'emergencyContact')} onBlur={(e) => handleCellBlur(e, entry, 'emergencyContact')} /></td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.accountNumber)} data-row={idx} data-col={10} defaultValue={entry.accountNumber} onKeyDown={(e) => handleCellKeyDown(e, entry, 'accountNumber', idx, 10)} type="text" className={`excel-input ${rowColor}`} style={getCellColor(entry, 'accountNumber') ? { color: getCellColor(entry, 'accountNumber') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'accountNumber')} onBlur={(e) => handleCellBlur(e, entry, 'accountNumber')} /></td>
                                  <td className="p-0 border border-gray-200 hidden md:table-cell"><input ref={(el) => syncInputValue(el, entry.trackingNumber || '')} data-row={idx} data-col={11} defaultValue={entry.trackingNumber || ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'trackingNumber', idx, 11)} type="text" className={`excel-input ${rowColor}`} style={getCellColor(entry, 'trackingNumber') ? { color: getCellColor(entry, 'trackingNumber') } : undefined} onContextMenu={(e) => handleCellContextMenu(e, entry.id, 'trackingNumber')} onBlur={(e) => handleCellBlur(e, entry, 'trackingNumber')} /></td>
                                  <td className="p-0 border border-gray-200 text-center align-middle">
                                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={entry.beforeDeposit} onChange={() => toggleBeforeDeposit(entry.id, entry.beforeDeposit)} />
                                  </td>
                                  <td className="p-0 border border-gray-200 text-center align-middle">
                                    <input type="checkbox" className="w-4 h-4 accent-green-600" checked={entry.afterDeposit} onChange={() => toggleAfterDeposit(entry.id, entry.afterDeposit)} />
                                  </td>
                                </tr>
                              );
                            })}
                            {filtered.length === 0 && (
                              <tr>
                                <td colSpan={17} className="p-16 text-center text-gray-300 font-bold">
                                  {debouncedManualSearch ? `"${debouncedManualSearch}" 검색 결과가 없습니다.` : `${manualViewDateStart === 'all' ? '전체' : manualViewDateStart === manualViewDateEnd ? manualViewDateStart : manualViewDateStart + ' ~ ' + manualViewDateEnd} 날짜에 데이터가 없습니다.`}
                                </td>
                              </tr>
                            )}
                            {filtered.length > 200 && (
                              <tr>
                                <td colSpan={17} className="p-4 text-center text-orange-500 font-bold text-xs">
                                  총 {filtered.length}건 중 200건만 표시됩니다. 검색어를 더 입력해주세요.
                                </td>
                              </tr>
                            )}
                          </>);
                        })()}
                      </tbody>
                    </table>
                    <div className="h-40"></div>
                  </div>
                </section>
              )}
            </div>
          )
        ) : (
          /* Customer Flow */
          <div className="max-w-2xl mx-auto pt-10 animate-in fade-in duration-500">
            {showSuccess ? (
              <div className="bg-white p-10 md:p-16 rounded-[48px] text-center space-y-10 shadow-2xl border border-gray-50">
                <div className="text-8xl animate-bounce">🎉</div>
                <div className="space-y-6">
                  <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">제출 완료!</h2>

                  <div className="bg-blue-50 p-8 rounded-[32px] text-left space-y-4 border border-blue-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-blue-600 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold">!</span>
                      <h3 className="font-black text-blue-900 text-lg">입금 예정 시간 안내</h3>
                    </div>

                    <div className="space-y-3 font-bold text-blue-800 leading-tight">
                      <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                        <span className="text-sm">오후 1시까지 접수 마감</span>
                        <span className="text-blue-600">→ 오후 3~5시 사이 입금</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                        <span className="text-sm">오후 1시 이후 접수</span>
                        <span className="text-blue-600">→ 익일 입금 진행</span>
                      </div>
                      <p className="text-[11px] text-blue-500 text-center pt-1 font-black uppercase">토 / 일 / 공휴일은 제외됩니다</p>
                    </div>

                    <div className="pt-4 border-t border-blue-200">
                      <p className="text-sm text-center text-blue-900 leading-relaxed font-bold italic">
                        "별도의 메세지가 없어도 인증샷 제출 완료하셨으면<br />자동으로 정상 접수 완료된 상태입니다."
                      </p>
                    </div>
                  </div>

                  {lastSubmittedType === 'apply' && (
                    <p className="text-gray-400 font-bold text-sm">
                      * 상품 수령 후 반드시 <b>'후기 인증'</b>까지 완료해주세요!
                    </p>
                  )}
                </div>

                <button onClick={resetCustomerFlow} className="w-full py-6 bg-black text-white rounded-[24px] text-2xl font-black shadow-xl hover:bg-gray-800 transition-all">메인으로</button>
              </div>
            ) : customerView === 'landing' ? (
              <div className="space-y-16 pt-16 flex flex-col items-center">
                <header className="text-center space-y-4">
                  <h1 className="text-7xl font-black tracking-tighter text-[#1D1D1F]">Mission Hub</h1>
                  <p className="text-gray-400 text-2xl font-bold tracking-tight">수행하실 단계를 선택하세요.</p>
                </header>
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 w-full ${!settings.isApplyActive ? 'max-w-xl mx-auto' : ''}`}>
                  {settings.isApplyActive && (
                    <button onClick={() => setCustomerView('apply')} className="group bg-white p-14 rounded-[48px] border border-gray-100 shadow-2xl transition-all hover:-translate-y-3 text-center active:scale-95">
                      <div className="text-7xl mb-8 group-hover:scale-110 transition-transform">🛍️</div>
                      <h3 className="text-3xl font-black tracking-tighter whitespace-nowrap">신청하기</h3>
                    </button>
                  )}
                  <button onClick={() => setCustomerView('review')} className={`group bg-white p-14 rounded-[48px] border border-gray-100 shadow-2xl transition-all hover:-translate-y-3 text-center active:scale-95 ${!settings.isApplyActive ? 'w-full' : ''}`}>
                    <div className="text-7xl mb-8 group-hover:scale-110 transition-transform">⭐</div>
                    <h3 className="text-3xl font-black tracking-tighter whitespace-nowrap">후기 인증</h3>
                  </button>
                </div>
              </div>
            ) : customerView === 'apply' ? (
              <div className="space-y-8 animate-in slide-in-from-bottom-5">
                <button onClick={() => selectedProductId ? setSelectedProductId(null) : setCustomerView('landing')} className="text-sm font-black text-gray-400 bg-gray-100 px-4 py-2 rounded-full">← 돌아가기</button>
                {!selectedProductId ? (
                  <div className="space-y-8">
                    <h2 className="text-3xl font-black tracking-tighter">참여할 미션을 선택하세요</h2>
                    <div className="grid grid-cols-1 gap-4">
                      {products.map(p => (
                        <button key={p.id} onClick={() => setSelectedProductId(p.id)} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-6 hover:border-blue-500 transition-all text-left">
                          <img src={p.thumbnail} className="w-24 h-24 rounded-2xl object-cover" />
                          <div className="flex-1">
                            <h3 className="text-xl font-black">{p.name}</h3>
                            <p className="text-blue-600 font-bold">+{p.refundAmount.toLocaleString()}원 리워드</p>
                            <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">잔여 {p.remainingQuota}명</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-8 rounded-[48px] shadow-2xl space-y-8 border border-gray-50">
                    <div className="flex items-center gap-6 pb-6 border-b">
                      <img src={selectedProduct?.thumbnail} className="w-24 h-24 rounded-3xl object-cover shadow-md" />
                      <div>
                        <h3 className="text-2xl font-black">{selectedProduct?.name}</h3>
                        <p className="text-blue-600 font-bold text-lg">{selectedProduct?.refundAmount.toLocaleString()}원 확정 리워드</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-3xl text-sm font-bold leading-relaxed whitespace-pre-line">
                      <p className="text-[10px] text-blue-500 font-black uppercase mb-2">구매 신청 안내</p>
                      {selectedProduct?.guideText}
                    </div>
                    {!customerForm.proofImage ? (
                      <div className="pt-4">
                        <input type="file" id="apply-upload" className="hidden" onChange={(e) => {
                          if (e.target.files?.[0]) {
                            const r = new FileReader();
                            r.onloadend = () => setCustomerForm({ ...customerForm, proofImage: r.result as string });
                            r.readAsDataURL(e.target.files[0]);
                          }
                        }} />
                        <label htmlFor="apply-upload" className="w-full py-12 bg-[#0071E3] text-white rounded-3xl text-center cursor-pointer block text-xl font-black shadow-xl shadow-blue-50 hover:bg-blue-600">📸 주문 완료 캡쳐 업로드</label>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="p-4 bg-[#34C759] text-white rounded-2xl flex justify-between items-center shadow-md">
                          <span className="font-bold">✅ 이미지가 등록되었습니다.</span>
                          <button onClick={() => setCustomerForm({ ...customerForm, proofImage: '' })} className="text-xs underline font-black">변경</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input type="text" placeholder="카톡 닉네임" className="p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500" value={customerForm.kakaoNick} onChange={e => setCustomerForm({ ...customerForm, kakaoNick: e.target.value })} />
                          <input type="text" placeholder="휴대폰 번호 (- 포함)" className="p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-blue-500" value={customerForm.phoneNumber} onChange={e => setCustomerForm({ ...customerForm, phoneNumber: e.target.value })} />
                        </div>
                        <button onClick={handleApplyFinalSubmit} className="w-full py-6 bg-black text-white rounded-3xl text-2xl font-black shadow-xl hover:bg-gray-800 transition-all">미션 신청하기</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8 animate-in slide-in-from-bottom-5">
                <button onClick={() => setCustomerView('landing')} className="text-sm font-black text-gray-400 bg-gray-100 px-4 py-2 rounded-full">← 돌아가기</button>
                <div className="bg-white p-10 rounded-[64px] shadow-2xl border-t-[16px] border-orange-500 space-y-8 text-center border-x border-b border-gray-50">
                  <h2 className="text-4xl font-black tracking-tighter">후기 인증 미션</h2>
                  <div className="bg-orange-50 p-6 rounded-3xl text-sm font-bold text-orange-900 leading-relaxed text-left">
                    <p className="text-[10px] text-orange-500 font-black uppercase mb-2 text-center">작성 가이드</p>
                    {settings.globalReviewGuide}
                  </div>

                  <div className="text-left space-y-2">
                    <label className="text-sm font-black ml-2 text-gray-500">환불계좌정보</label>
                    <input
                      type="text"
                      placeholder="은행명/계좌/이름"
                      className="w-full p-4 bg-gray-50 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-orange-500 transition-all text-center text-lg"
                      value={customerForm.orderNumber || ''}
                      onChange={(e) => setCustomerForm({ ...customerForm, orderNumber: e.target.value })}
                    />
                  </div>

                  <input type="file" id="review-upload" className="hidden" onChange={handleDirectReviewUpload} />
                  <label htmlFor="review-upload" className="w-full py-20 bg-gray-50 border-4 border-dashed border-gray-100 rounded-[48px] block cursor-pointer group hover:border-orange-500 transition-all">
                    {isSubmitting ? <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div> : (
                      <div>
                        <span className="text-6xl block mb-4 group-hover:scale-110 transition-transform">📤</span>
                        <p className="text-xl font-black">포토 리뷰 화면 업로드</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        .excel-table th, .excel-table td {
          border: 1px solid #000 !important;
        }
        .excel-input {
          width: 100%;
          height: 100%;
          min-height: 14px;
          padding: 0px 2px;
          line-height: 1.2;
          border: 1px solid transparent;
          background: transparent;
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          outline: none;
          color: inherit;
          transition: all 0.2s ease;
        }
        .excel-input:focus {
          background: #fefff5;
          border-color: #0071E3;
          box-shadow: 0 0 0 2px rgba(0,113,227,0.12), 0 1px 3px rgba(0,0,0,0.04);
          transform: scaleY(1.03);
        }
        td:hover > .excel-input:not(:focus) {
          background: rgba(59,130,246,0.06);
          border-color: rgba(59,130,246,0.2);
        }
        @keyframes ocrProgress {
          0% { width: 10%; }
          50% { width: 80%; }
          100% { width: 10%; }
        }
        @keyframes cellPop {
          0% { transform: scale(1); }
          40% { transform: scale(1.08); }
          70% { transform: scale(0.97); }
          100% { transform: scale(1); }
        }
        .cell-pop {
          animation: cellPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes bounceIn {
          0% { opacity: 0; transform: translate(-50%, 20px) scale(0.8); }
          60% { opacity: 1; transform: translate(-50%, -4px) scale(1.05); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        .animate-bounce-in {
          animation: bounceIn 0.35s ease-out;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .col-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: 0;
          width: 5px;
          cursor: col-resize;
          z-index: 40;
          background: transparent;
        }
        .col-resize-handle:hover {
          background: rgba(0,113,227,0.4);
        }
        table tbody tr { user-select: none; -webkit-user-select: none; }
        table tbody tr input, table tbody tr button { user-select: auto; -webkit-user-select: auto; }
      `}</style>

      {/* 업무일지 업로드 미리보기 모달 */}
      {pendingUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPendingUpload(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">업로드 미리보기</h3>
              <p className="text-xs text-gray-500 mt-1">{pendingUpload.uploadDate} · 확인 후 저장하세요</p>
            </div>
            <div className="p-4 space-y-4">
              {/* 판매 항목 */}
              {pendingUpload.salesItems.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    판매 항목 ({pendingUpload.salesItems.length}건)
                  </h4>
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="py-2 px-3 text-left text-gray-500 font-bold">품목</th>
                          <th className="py-2 px-3 text-right text-gray-500 font-bold">수량</th>
                          <th className="py-2 px-3 text-right text-gray-500 font-bold">마진</th>
                          <th className="py-2 px-3 text-right text-gray-500 font-bold">광고비</th>
                          <th className="py-2 px-3 text-right text-gray-500 font-bold">반품</th>
                          <th className="py-2 px-3 text-right text-gray-500 font-bold">슬롯</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingUpload.salesItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5 px-3 text-gray-700">{item.product}</td>
                            <td className="py-1.5 px-3 text-right text-gray-600">{item.quantity}</td>
                            <td className="py-1.5 px-3 text-right font-bold">{item.totalMargin.toLocaleString()}</td>
                            <td className="py-1.5 px-3 text-right text-red-500">{item.adCost ? item.adCost.toLocaleString() : '-'}</td>
                            <td className="py-1.5 px-3 text-right text-red-500">{item.refund ? item.refund.toLocaleString() : '-'}</td>
                            <td className="py-1.5 px-3 text-right text-red-500">{item.solution ? item.solution.toLocaleString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 font-bold">
                          <td className="py-2 px-3 text-gray-700">합계</td>
                          <td className="py-2 px-3 text-right text-gray-600">{pendingUpload.salesItems.reduce((s, i) => s + i.quantity, 0)}</td>
                          <td className="py-2 px-3 text-right">{pendingUpload.salesItems.reduce((s, i) => s + i.totalMargin, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-red-500">{pendingUpload.salesItems.reduce((s, i) => s + i.adCost, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-red-500">{pendingUpload.salesItems.reduce((s, i) => s + i.refund, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-red-500">{pendingUpload.salesItems.reduce((s, i) => s + i.solution, 0).toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {pendingUpload.salesItems.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">등록할 항목이 없습니다.</p>
              )}

              {/* 공통 비용 항목 */}
              {Object.keys(pendingUpload.overheadCategories).length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                    공통 비용 ({Object.keys(pendingUpload.overheadCategories).length}항목)
                  </h4>
                  <div className="bg-red-50 rounded-xl p-3 space-y-1">
                    {Object.entries(pendingUpload.overheadCategories).map(([cat, amt]) => (
                      <div key={cat} className="flex justify-between text-xs">
                        <span className="text-gray-600">{cat}</span>
                        <span className="font-bold text-red-500">-{amt.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs border-t border-red-200 pt-1 mt-1">
                      <span className="font-bold text-gray-700">합계</span>
                      <span className="font-bold text-red-600">-{Object.values(pendingUpload.overheadCategories).reduce((s, v) => s + v, 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => setPendingUpload(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">취소</button>
              <button onClick={handleConfirmUpload}
                disabled={pendingUpload.salesItems.length === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 transition-colors">
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 운송장 양식 목록 모달 */}
      {templateListModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTemplateListModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">운송장 파일 양식 설정</h3>
              <button onClick={() => setTemplateListModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-2">
              {exportTemplates.map((tpl, idx) => {
                const colorMap: Record<string, string> = { red: 'bg-red-100 text-red-700', orange: 'bg-orange-100 text-orange-700', blue: 'bg-blue-100 text-blue-700', green: 'bg-green-100 text-green-700', purple: 'bg-purple-100 text-purple-700', pink: 'bg-pink-100 text-pink-700', gray: 'bg-gray-100 text-gray-700' };
                return (
                  <div key={tpl.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${colorMap[tpl.color] || 'bg-gray-100 text-gray-700'}`}>{tpl.name}</span>
                    <span className="text-xs text-gray-400">{tpl.columns.length}열</span>
                    <div className="ml-auto flex gap-1">
                      <button onClick={() => { setTemplateListModal(false); setTemplateEditModal(JSON.parse(JSON.stringify(tpl))); }} className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg">편집</button>
                      <button onClick={async () => {
                        if (!window.confirm(`"${tpl.name}" 양식을 삭제하시겠습니까?`)) return;
                        const updated = exportTemplates.filter((_, i) => i !== idx);
                        await saveExportTemplates(updated);
                      }} className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg">삭제</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100">
              <button onClick={() => {
                setTemplateListModal(false);
                setTemplateEditModal({
                  id: Math.random().toString(36).substr(2, 9),
                  name: '새 양식',
                  sheetName: 'Sheet1',
                  filePrefix: '내보내기',
                  color: 'blue',
                  columns: [{ header: '주문번호', source: 'orderNumber' }],
                });
              }} className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600">+ 새 양식 추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 운송장 양식 편집 모달 */}
      {templateEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTemplateEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">양식 편집: {templateEditModal.name}</h3>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">양식 이름</label>
                  <input value={templateEditModal.name} onChange={e => setTemplateEditModal({ ...templateEditModal, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">시트 이름</label>
                  <input value={templateEditModal.sheetName} onChange={e => setTemplateEditModal({ ...templateEditModal, sheetName: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">파일명 접두사</label>
                  <input value={templateEditModal.filePrefix} onChange={e => setTemplateEditModal({ ...templateEditModal, filePrefix: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">버튼 색상</label>
                  <select value={templateEditModal.color} onChange={e => setTemplateEditModal({ ...templateEditModal, color: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {['red','orange','blue','green','purple','pink','gray'].map(c => <option key={c} value={c}>{c === 'red' ? '빨강' : c === 'orange' ? '주황' : c === 'blue' ? '파랑' : c === 'green' ? '초록' : c === 'purple' ? '보라' : c === 'pink' ? '분홍' : '회색'}</option>)}
                  </select>
                </div>
              </div>

              {/* 열 설정 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-500">열 설정 ({templateEditModal.columns.length}열)</label>
                  <button onClick={() => setTemplateEditModal({ ...templateEditModal, columns: [...templateEditModal.columns, { header: '', source: 'empty' }] })} className="px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg">+ 열 추가</button>
                </div>
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                  {templateEditModal.columns.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                      <span className="text-[10px] text-gray-400 font-mono w-5 text-center">{idx + 1}</span>
                      <input
                        value={col.header}
                        onChange={e => {
                          const cols = [...templateEditModal.columns];
                          cols[idx] = { ...cols[idx], header: e.target.value };
                          setTemplateEditModal({ ...templateEditModal, columns: cols });
                        }}
                        placeholder="헤더명"
                        className="flex-1 px-2 py-1.5 border rounded text-xs min-w-0"
                      />
                      <select
                        value={col.source}
                        onChange={e => {
                          const cols = [...templateEditModal.columns];
                          cols[idx] = { ...cols[idx], source: e.target.value as ExportFieldSource };
                          setTemplateEditModal({ ...templateEditModal, columns: cols });
                        }}
                        className="px-2 py-1.5 border rounded text-xs w-28"
                      >
                        {(Object.keys(FIELD_SOURCE_LABELS) as ExportFieldSource[]).map(k => (
                          <option key={k} value={k}>{FIELD_SOURCE_LABELS[k]}</option>
                        ))}
                      </select>
                      {col.source === 'fixed' && (
                        <input
                          value={col.fixedValue || ''}
                          onChange={e => {
                            const cols = [...templateEditModal.columns];
                            cols[idx] = { ...cols[idx], fixedValue: e.target.value };
                            setTemplateEditModal({ ...templateEditModal, columns: cols });
                          }}
                          placeholder="고정값"
                          className="px-2 py-1.5 border rounded text-xs w-20"
                        />
                      )}
                      {col.source === 'masterCol' && (
                        <input
                          value={col.masterColName || ''}
                          onChange={e => {
                            const cols = [...templateEditModal.columns];
                            cols[idx] = { ...cols[idx], masterColName: e.target.value };
                            setTemplateEditModal({ ...templateEditModal, columns: cols });
                          }}
                          placeholder="마스터 컬럼명"
                          className="px-2 py-1.5 border rounded text-xs w-28 border-teal-300"
                        />
                      )}
                      {col.source === 'emergencyContact' && (
                        <label className="flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap">
                          <input type="checkbox" checked={col.stripDash || false} onChange={e => {
                            const cols = [...templateEditModal.columns];
                            cols[idx] = { ...cols[idx], stripDash: e.target.checked };
                            setTemplateEditModal({ ...templateEditModal, columns: cols });
                          }} className="w-3 h-3" />
                          -제거
                        </label>
                      )}
                      <div className="flex gap-0.5">
                        <button disabled={idx === 0} onClick={() => {
                          const cols = [...templateEditModal.columns];
                          [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
                          setTemplateEditModal({ ...templateEditModal, columns: cols });
                        }} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="위로">▲</button>
                        <button disabled={idx === templateEditModal.columns.length - 1} onClick={() => {
                          const cols = [...templateEditModal.columns];
                          [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
                          setTemplateEditModal({ ...templateEditModal, columns: cols });
                        }} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="아래로">▼</button>
                      </div>
                      <button onClick={() => {
                        const cols = templateEditModal.columns.filter((_, i) => i !== idx);
                        setTemplateEditModal({ ...templateEditModal, columns: cols });
                      }} className="p-1 text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => setTemplateEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200">취소</button>
              <button onClick={async () => {
                if (!templateEditModal.name.trim()) { alert('양식 이름을 입력해주세요.'); return; }
                if (templateEditModal.columns.length === 0) { alert('열이 최소 1개 이상 필요합니다.'); return; }
                const existing = exportTemplates.findIndex(t => t.id === templateEditModal.id);
                const updated = existing >= 0
                  ? exportTemplates.map((t, i) => i === existing ? templateEditModal : t)
                  : [...exportTemplates, templateEditModal];
                await saveExportTemplates(updated);
                setTemplateEditModal(null);
              }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600">저장</button>
            </div>
          </div>
        </div>
      )}


      {/* 플랫폼 설정 모달 */}
      {platformConfigModal && (() => {
        const isAngun = colPrefix === '';
        // 편집 중인 항목이 공유 플랫폼인지 전용 플랫폼인지
        const editingShared = platformEditItem ? sharedPlatformConfigs.some(p => p.id === platformEditItem.id) : false;
        const editingOwn = platformEditItem ? platformConfigs.some(p => p.id === platformEditItem.id) : false;
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setPlatformConfigModal(false); setPlatformEditItem(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">플랫폼 설정</h3>
              <button onClick={() => { setPlatformConfigModal(false); setPlatformEditItem(null); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {/* 공유 플랫폼 섹션 */}
              <div>
                <p className="text-[11px] font-bold text-teal-600 mb-1.5">공유 플랫폼 (안군농원 기준 · 모든 사업자 사용 가능)</p>
                {sharedPlatformConfigs.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-3">등록된 공유 플랫폼이 없습니다.</p>
                ) : (
                  <div className="space-y-1.5">
                    {sharedPlatformConfigs.map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-teal-100 bg-teal-50/40 hover:bg-teal-50">
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-sm text-gray-800">{p.name}</span>
                          <span className="ml-2 text-xs text-gray-400">헤더행 {p.headerRow + 1}행 · 주문번호 컬럼: "{p.orderNumColName}"</span>
                        </div>
                        {isAngun && (
                          <div className="flex gap-1">
                            <button onClick={() => setPlatformEditItem(JSON.parse(JSON.stringify(p)))} className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg">편집</button>
                            <button onClick={async () => {
                              if (!window.confirm(`"${p.name}" 공유 플랫폼을 삭제하시겠습니까?`)) return;
                              await savePlatformConfigs(sharedPlatformConfigs.filter((_, i) => i !== idx));
                            }} className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg">삭제</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* 전용 플랫폼 섹션 (안군농원이 아닌 경우만) */}
              {!isAngun && (
                <div>
                  <p className="text-[11px] font-bold text-purple-600 mb-1.5">{bizInfo?.name} 전용 플랫폼</p>
                  {platformConfigs.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-3">등록된 전용 플랫폼이 없습니다.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {platformConfigs.map((p, idx) => (
                        <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-sm text-gray-800">{p.name}</span>
                            <span className="ml-2 text-xs text-gray-400">헤더행 {p.headerRow + 1}행 · 주문번호 컬럼: "{p.orderNumColName}"</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setPlatformEditItem(JSON.parse(JSON.stringify(p)))} className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg">편집</button>
                            <button onClick={async () => {
                              if (!window.confirm(`"${p.name}" 플랫폼을 삭제하시겠습니까?`)) return;
                              await savePlatformConfigs(platformConfigs.filter((_, i) => i !== idx));
                            }} className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg">삭제</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {platformEditItem ? (
              <div className="p-4 border-t border-gray-100 space-y-3">
                <p className="text-xs font-bold text-gray-500">
                  {(editingShared || editingOwn) ? '편집' : '새 플랫폼 추가'}
                  {!isAngun && !editingShared && <span className="ml-1 text-purple-500">({bizInfo?.name} 전용)</span>}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 mb-1 block">플랫폼 이름</label>
                    <input value={platformEditItem.name} onChange={e => setPlatformEditItem({ ...platformEditItem, name: e.target.value })} placeholder="예: 네이버" className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 mb-1 block">헤더 행 위치</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} value={platformEditItem.headerRow + 1} onChange={e => setPlatformEditItem({ ...platformEditItem, headerRow: Math.max(0, Number(e.target.value) - 1) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                      <span className="text-xs text-gray-400 whitespace-nowrap">행</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 mb-1 block">주문번호 컬럼명</label>
                  <input value={platformEditItem.orderNumColName} onChange={e => setPlatformEditItem({ ...platformEditItem, orderNumColName: e.target.value })} placeholder="예: 주문번호" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-gray-500">컬럼 매핑</label>
                    <label className="px-2 py-1 bg-teal-500 text-white rounded text-[11px] font-bold hover:bg-teal-600 cursor-pointer">
                      📋 주문서 업로드해서 컬럼 불러오기
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const cols = await parseSampleColumns(file, platformEditItem.headerRow);
                          setPlatformEditItem({ ...platformEditItem, sampleColumns: cols });
                        } catch { alert('파일 파싱 중 오류가 발생했습니다.'); }
                        e.target.value = '';
                      }} />
                    </label>
                  </div>
                  {(!platformEditItem.sampleColumns || platformEditItem.sampleColumns.length === 0) ? (
                    <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded-lg p-2">위 버튼으로 마스터 주문서를 업로드하면 컬럼 목록이 드롭박스로 표시됩니다.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
                      {([['name2','받는사람'],['address','주소'],['emergencyContact','전화번호'],['ordererName','주문자명'],['name1','이름1'],['product','품목'],['memo','비고'],['count','수량'],['paymentAmount','결제금액']] as [string,string][]).map(([src, label]) => (
                        <div key={src} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-600 w-16 shrink-0">{label}</span>
                          <span className="text-[11px] text-gray-400">←</span>
                          <select
                            value={platformEditItem.fieldMapping?.[src] || ''}
                            onChange={e => setPlatformEditItem({ ...platformEditItem, fieldMapping: { ...platformEditItem.fieldMapping, [src]: e.target.value } })}
                            className="flex-1 px-2 py-1 border rounded text-xs bg-white"
                          >
                            <option value="">(매핑 안함)</option>
                            {platformEditItem.sampleColumns!.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPlatformEditItem(null)} className="flex-1 py-2 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200">취소</button>
                  <button onClick={async () => {
                    if (!platformEditItem.name.trim()) { alert('플랫폼 이름을 입력해주세요.'); return; }
                    if (!platformEditItem.orderNumColName.trim()) { alert('주문번호 컬럼명을 입력해주세요.'); return; }
                    if (isAngun || editingShared) {
                      // 안군농원이거나 공유 플랫폼 편집: 공유 컬렉션에 저장
                      const existing = sharedPlatformConfigs.findIndex(p => p.id === platformEditItem.id);
                      const updated = existing >= 0
                        ? sharedPlatformConfigs.map((p, i) => i === existing ? platformEditItem : p)
                        : [...sharedPlatformConfigs, platformEditItem];
                      await setDoc(doc(db, 'settings', 'platformConfigs'), { configs: updated });
                    } else {
                      // 다른 사업자: 전용 컬렉션에 저장
                      const existing = platformConfigs.findIndex(p => p.id === platformEditItem.id);
                      const updated = existing >= 0
                        ? platformConfigs.map((p, i) => i === existing ? platformEditItem : p)
                        : [...platformConfigs, platformEditItem];
                      await savePlatformConfigs(updated);
                    }
                    setPlatformEditItem(null);
                  }} className="flex-1 py-2 rounded-xl text-sm font-bold text-white bg-teal-500 hover:bg-teal-600">저장</button>
                </div>
              </div>
            ) : (
              <div className="p-4 border-t border-gray-100">
                <button onClick={() => setPlatformEditItem({ id: Math.random().toString(36).substr(2, 9), name: '', headerRow: 0, orderNumColName: '주문번호' })} className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-teal-500 hover:bg-teal-600">
                  + {isAngun ? '새 플랫폼 추가 (공유)' : `새 플랫폼 추가 (${bizInfo?.name} 전용)`}
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

    </div>
  );
};

export default App;