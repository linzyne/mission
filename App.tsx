import React, { useState, useEffect, useRef } from 'react';
import { Product, Submission, AppMode, CustomerView, AppSettings, AdminTab, ManualEntry, ReviewEntry, ProductPrice } from './types';
import { verifyImage } from './services/geminiService';
import { db } from './services/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, query, orderBy, writeBatch } from 'firebase/firestore';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('customer');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [customerView, setCustomerView] = useState<CustomerView>('landing');

  const [adminPassword, setAdminPassword] = useState('1234');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Firestore Sync: Settings
  const [settings, setSettings] = useState<AppSettings>({ isApplyActive: true });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data() as AppSettings);
    });
    return () => unsub();
  }, []);

  const updateSettings = async (newSettings: AppSettings) => {
    await setDoc(doc(db, 'settings', 'global'), newSettings, { merge: true });
  };

  const createEmptyRow = (date?: string): ManualEntry => ({
    id: Math.random().toString(36).substr(2, 9),
    proofImage: '',
    count: 0,
    product: '',
    date: date || new Date().toISOString().split('T')[0],
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
    const q = query(collection(db, 'products'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(list);
    });
    return () => unsub();
  }, []);

  // Firestore Sync: Manual Entries
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'manualEntries'));
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
          proofImage: data.proofImage ?? '',
          product: data.product ?? '',
          date: data.date ?? '',
          name1: data.name1 ?? '',
          name2: data.name2 ?? '',
          ordererName: data.ordererName ?? '',
          orderNumber: data.orderNumber ?? '',
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
        // 날짜별로 그룹핑 → 같은 날짜 내 문서 ID 순으로 createdAt 부여
        const byDate: Record<string, typeof missing> = {};
        missing.forEach(e => {
          const d = e.date || '0000';
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(e);
        });
        const batch = writeBatch(db);
        let base = 1000000000000; // 2001년 기준 timestamp (기존 행은 앞에 배치)
        Object.keys(byDate).sort().forEach(date => {
          byDate[date].forEach((e, i) => {
            batch.update(doc(db, 'manualEntries', e.id), { createdAt: base + i });
          });
          base += byDate[date].length;
        });
        batch.commit().catch(err => console.error('[Migration] createdAt 부여 실패:', err));
      }

      list.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      setManualEntries(list);
    });
    return () => unsub();
  }, []);

  // Firestore Sync: Review Entries
  const [reviewEntries, setReviewEntries] = useState<ReviewEntry[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'reviewEntries'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewEntry));
      list.sort((a, b) => b.date.localeCompare(a.date));
      setReviewEntries(list);
    });
    return () => unsub();
  }, []);

  // Firestore Sync: Product Prices
  const [productPrices, setProductPrices] = useState<ProductPrice[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'productPrices'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductPrice));
      setProductPrices(list);
    });
    return () => unsub();
  }, []);

  const [newProductPrice, setNewProductPrice] = useState({ name: '', price: 0 });

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
  const [manualViewDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedManualIds, setSelectedManualIds] = useState<Set<string>>(new Set());

  const [depositBeforeDate, setDepositBeforeDate] = useState<string>('all');
  const [depositAfterDate, setDepositAfterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [depositActionDate, setDepositActionDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [manualSearch, setManualSearch] = useState('');

  const [depositSearch, setDepositSearch] = useState('');
  const [debouncedDepositSearch, setDebouncedDepositSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ManualEntry; direction: 'asc' | 'desc' } | null>(null);

  const composingRef = useRef(false);
  const [debouncedManualSearch, setDebouncedManualSearch] = useState('');

  // Date range for purchase list
  const [manualViewDateStart, setManualViewDateStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [manualViewDateEnd, setManualViewDateEnd] = useState<string>(new Date().toISOString().split('T')[0]);

  // Row drag selection
  const isDraggingRef = useRef(false);
  const dragStartIndexRef = useRef<number>(-1);

  // Cell drag selection (Excel-like)
  const [cellSelection, setCellSelection] = useState<{startRow: number, startCol: number, endRow: number, endCol: number} | null>(null);
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

  // --- Uncontrolled input helpers (no cursor jump, no IME issues) ---
  // Sync uncontrolled input from Firestore when cell is NOT focused
  const syncInputValue = (el: HTMLInputElement | null, value: any) => {
    if (el && document.activeElement !== el) {
      const strVal = (value != null && value !== 0 && value !== false) ? String(value) : '';
      if (el.value !== strVal) el.value = strVal;
    }
  };

  // Commit cell value on blur (only if changed)
  const handleCellBlur = (e: React.FocusEvent<HTMLInputElement>, entry: ManualEntry, field: keyof ManualEntry) => {
    const rawVal = e.target.value;
    let newVal: any = rawVal;
    if (field === 'count') newVal = Number(rawVal) || 0;
    else if (field === 'paymentAmount') newVal = Number(rawVal.replace(/,/g, '')) || 0;

    const oldVal = entry[field];
    if (String(newVal) !== String(oldVal != null ? oldVal : '')) {
      updateManualEntry(entry.id, field, newVal);
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
          batch.set(doc(db, 'manualEntries', e.id), e.data);
          redoEntries.push({ id: e.id, data: {} });
        });
        setRedoStack(prev => [...prev, { type: 'add', entries: redoEntries, description: last.description }]);
      } else if (last.type === 'update') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          const currentData: any = {};
          Object.keys(e.data).forEach(k => { currentData[k] = current ? (current as any)[k] : ''; });
          redoEntries.push({ id: e.id, data: currentData });
          batch.update(doc(db, 'manualEntries', e.id), e.data);
        });
        setRedoStack(prev => [...prev, { type: 'update', entries: redoEntries, description: last.description }]);
      } else if (last.type === 'add') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          redoEntries.push({ id: e.id, data: current ? { ...current } : {} });
          batch.delete(doc(db, 'manualEntries', e.id));
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
          batch.delete(doc(db, 'manualEntries', e.id));
        });
        setUndoStack(prev => [...prev, { type: 'delete', entries: undoEntries, description: last.description }]);
      } else if (last.type === 'update') {
        last.entries.forEach(e => {
          const current = manualEntries.find(m => m.id === e.id);
          const currentData: any = {};
          Object.keys(e.data).forEach(k => { currentData[k] = current ? (current as any)[k] : ''; });
          undoEntries.push({ id: e.id, data: currentData });
          batch.update(doc(db, 'manualEntries', e.id), e.data);
        });
        setUndoStack(prev => [...prev, { type: 'update', entries: undoEntries, description: last.description }]);
      } else if (last.type === 'delete') {
        last.entries.forEach(e => {
          batch.set(doc(db, 'manualEntries', e.id), e.data);
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
      await updateDoc(doc(db, 'manualEntries', id), { proofImage: base64Image });

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
          await updateDoc(doc(db, 'manualEntries', id), updates);
        }
      } catch (err) {
        console.error('[Drop OCR] 실패:', err);
      }
    };
    reader.readAsDataURL(file);
  };

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
          batch.delete(doc(db, 'manualEntries', id));
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

  const handleSort = (key: keyof ManualEntry) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    // 정렬 결과를 createdAt로 Firestore에 반영
    const sorted = [...manualEntries].sort((a, b) => {
      const aValue = a[key] || '';
      const bValue = b[key] || '';
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    const batch = writeBatch(db);
    sorted.forEach((e, i) => {
      batch.update(doc(db, 'manualEntries', e.id), { createdAt: i });
    });
    batch.commit().catch(err => console.error('[Sort] createdAt 업데이트 실패:', err));
  };

  // ✅ Deposit Management Robust Handlers
  const handleBulkDepositComplete = async () => {
    if (selectedDepositIds.size === 0) return;
    if (!window.confirm(`${selectedDepositIds.size}건을 입금완료 처리하시겠습니까?`)) return;

    try {
      const batch = writeBatch(db);
      selectedDepositIds.forEach(id => {
        batch.update(doc(db, 'manualEntries', id), { afterDeposit: true, depositDate: depositActionDate });
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
        batch.update(doc(db, 'manualEntries', id), { afterDeposit: false });
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
        batch.update(doc(db, 'manualEntries', id), { reservationComplete: true });
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
        batch.update(doc(db, 'manualEntries', id), { reservationComplete: false });
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
      await updateDoc(doc(db, 'manualEntries', id), { [field]: false });
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
      await deleteDoc(doc(db, 'manualEntries', id));
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

      await updateDoc(doc(db, 'manualEntries', id), updates);
    } catch (e) {
      console.error("Toggle Error:", e);
      alert("오류가 발생했습니다: " + e);
    }
  };

  const toggleAfterDeposit = async (id: string, currentVal: boolean) => {
    try {
      await updateDoc(doc(db, 'manualEntries', id), {
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
      await updateDoc(doc(db, 'products', editingProductId), {
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
      await addDoc(collection(db, 'products'), product);
    }
    setNewProduct({ name: '', guideText: '', refundAmount: 0, totalQuota: 10, thumbnail: '' });
  };

  const deleteProduct = async (id: string) => {
    if (window.confirm("이 품목을 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, 'products', id));
    }
  };

  const addMoreRows = async (count: number) => {
    const dateToUse = manualViewDateStart !== 'all' ? manualViewDateStart : new Date().toISOString().split('T')[0];
    const newIds: string[] = [];
    const promises = Array.from({ length: count }).map(() => {
      const newRow = createEmptyRow(dateToUse);
      newIds.push(newRow.id);
      return setDoc(doc(db, 'manualEntries', newRow.id), newRow);
    });
    await Promise.all(promises);
    // Save for undo
    pushUndo({
      type: 'add',
      entries: newIds.map(id => ({ id, data: {} })),
      description: `${count}줄 추가`
    });
  };

  const updateManualEntry = async (id: string, field: keyof ManualEntry, value: any) => {
    const entry = manualEntries.find(e => e.id === id);
    if (!entry) return;

    const updates: Partial<ManualEntry> = { [field]: value };

    // Undo: Save previous value
    pushUndo({
      type: 'update',
      entries: [{ id: entry.id, data: { [field]: entry[field] } }],
      description: `${field} 수정`
    });

    // Auto-calculate Payment Amount
    if (field === 'product' || field === 'orderNumber') {
      const productName = field === 'product' ? value : entry.product;
      const matchedPrice = productPrices.find(p => p.name === productName);

      if (matchedPrice) {
        let finalPrice = matchedPrice.price;
        const orderNum = field === 'orderNumber' ? value : entry.orderNumber;
        if ((orderNum || '').includes('실배')) {
          finalPrice -= 1000;
        }
        updates.paymentAmount = finalPrice;
      }
    }

    await updateDoc(doc(db, 'manualEntries', id), updates);
  };

  const handleManualImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      updateManualEntry(id, 'proofImage', base64Image);

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
          await updateDoc(doc(db, 'manualEntries', id), ocrUpdates);
        }
      } catch (err) {
        console.error('[Upload OCR] 실패:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const multiImageInputRef = useRef<HTMLInputElement>(null);

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
      const dateToUse = dateStart !== 'all' ? dateStart : new Date().toISOString().split('T')[0];
      const newIds: string[] = [];
      const promises = Array.from({ length: needed }).map(() => {
        const newRow = createEmptyRow(dateToUse);
        newIds.push(newRow.id);
        return setDoc(doc(db, 'manualEntries', newRow.id), newRow);
      });
      await Promise.all(promises);
      // 새로 만든 행 추가
      const newEntries = newIds.map(id => createEmptyRow(dateToUse)).map((row, i) => ({ ...row, id: newIds[i] }));
      available = [...available, ...newEntries];
    }

    // 각 파일을 빈 행에 할당
    fileArr.forEach((file, i) => {
      if (i >= available.length) return;
      const targetEntry = available[i];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result as string;
        await updateDoc(doc(db, 'manualEntries', targetEntry.id), { proofImage: base64Image });

        try {
          const { extractOrderInfo } = await import('./services/geminiService');
          const result = await extractOrderInfo(base64Image);
          console.log(`[Multi OCR ${i + 1}] 결과:`, result);

          const ocrUpdates: Partial<ManualEntry> = {};
          if (result.orderNumber) ocrUpdates.orderNumber = result.orderNumber;
          if (result.receiverName) ocrUpdates.name2 = result.receiverName;
          else if (result.ordererName) ocrUpdates.name2 = result.ordererName;
          if (result.address) ocrUpdates.address = result.address;
          if (result.phone) ocrUpdates.emergencyContact = result.phone;

          if (Object.keys(ocrUpdates).length > 0) {
            await updateDoc(doc(db, 'manualEntries', targetEntry.id), ocrUpdates);
          }
        } catch (err) {
          console.error(`[Multi OCR ${i + 1}] 실패:`, err);
        }
      };
      reader.readAsDataURL(file);
    });

    // 파일 input 초기화 (같은 파일 재선택 가능)
    e.target.value = '';
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
    setCellSelection(null);
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!cellDragRef.current.active) return;
    const { row: startRow, col: startCol } = cellDragRef.current;
    if (startRow === row && startCol === col) return;
    // 드래그 시작 → 입력 포커스 해제, 선택 범위 표시
    (document.activeElement as HTMLElement)?.blur();
    setCellSelection({ startRow, startCol, endRow: row, endCol: col });
  };

  const handleCellMouseUp = () => {
    cellDragRef.current.active = false;
  };

  // Ctrl+C: 선택된 셀 복사
  useEffect(() => {
    const handleCopy = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (!cellSelection) return;
      // 입력 중이면 기본 복사 동작 유지
      if (document.activeElement?.tagName === 'INPUT') return;

      e.preventDefault();
      const minR = Math.min(cellSelection.startRow, cellSelection.endRow);
      const maxR = Math.max(cellSelection.startRow, cellSelection.endRow);
      const minC = Math.min(cellSelection.startCol, cellSelection.endCol);
      const maxC = Math.max(cellSelection.startCol, cellSelection.endCol);

      const rows: string[] = [];
      for (let r = minR; r <= maxR; r++) {
        const cols: string[] = [];
        for (let c = minC; c <= maxC; c++) {
          const input = document.querySelector(`input[data-row="${r}"][data-col="${c}"]`) as HTMLInputElement;
          cols.push(input?.value || '');
        }
        rows.push(cols.join('\t'));
      }
      navigator.clipboard.writeText(rows.join('\n'));
    };
    document.addEventListener('keydown', handleCopy);
    return () => document.removeEventListener('keydown', handleCopy);
  }, [cellSelection]);

  const downloadBeforeDepositCsv = () => {
    const beforeItems = manualEntries.filter(e => e.beforeDeposit && !e.afterDeposit);
    if (beforeItems.length === 0) return alert("다운로드할 데이터가 없습니다.");

    const chunkSize = 15;
    const today = new Date().toISOString().split('T')[0];

    for (let i = 0; i < beforeItems.length; i += chunkSize) {
      const chunk = beforeItems.slice(i, i + chunkSize);
      const rows = chunk.map(e => {
        const parts = e.accountNumber.split(/[\s\/\|]+/).filter(Boolean);
        const bankName = parts.length >= 2 ? parts[0] : '';
        const accountNum = parts.length >= 2 ? parts.slice(1).join('') : e.accountNumber;
        return [bankName, accountNum, e.paymentAmount || '', e.name1 || e.name2, '안군농원환불'].join(',');
      });

      const csvContent = rows.join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileIndex = (i / chunkSize) + 1;
      link.download = `${today} 환불입금내역_${fileIndex}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
    link.download = `Mission_Export_${new Date().toISOString().split('T')[0]}.csv`;
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
        date: new Date().toISOString().split('T')[0],
        paymentAmount: selectedProduct?.price || 0,
      };

      const priceObj = productPrices.find(p => p.name === newEntry.product);
      if (priceObj) newEntry.paymentAmount = priceObj.price;

      await addDoc(collection(db, 'manualEntries'), newEntry);

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
          date: new Date().toISOString().split('T')[0],
        };
        await addDoc(collection(db, 'reviewEntries'), reviewEntry);

        if (extractedOrderNumber) {
          const matchedEntry = manualEntries.find(entry => entry.orderNumber === extractedOrderNumber);
          if (matchedEntry) {
            await updateDoc(doc(db, 'manualEntries', matchedEntry.id), { beforeDeposit: true });
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
    const todayStr = new Date().toISOString().split('T')[0];
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
    const todayStr = new Date().toISOString().split('T')[0];
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
    <div className="min-h-screen bg-[#FBFBFD] font-sans text-[#1D1D1F] antialiased">
      {/* Lightbox Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
          <img src={previewImage} className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95 duration-200" alt="Preview" />
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-2xl font-bold transition-colors">&times;</button>
        </div>
      )}

      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-[1500px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={resetCustomerFlow}>
            <div className="w-8 h-8 bg-[#0071E3] rounded-lg flex items-center justify-center text-white font-black">M</div>
            <span className="font-bold text-xl tracking-tight uppercase">Mission Hub</span>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setMode('customer')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'customer' ? 'bg-white shadow-sm text-[#0071E3]' : 'text-gray-500'}`}>체험단</button>
            <button onClick={() => setMode('admin')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'admin' ? 'bg-white shadow-sm text-[#0071E3]' : 'text-gray-500'}`}>관리자</button>
          </div>
        </div>
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
          ) : (
            <div className="space-y-10">
              <div className="flex gap-4 border-b border-gray-100 pb-2">
                <button onClick={() => setAdminTab('dashboard')} className={`pb-2 px-6 text-sm font-black transition-all ${adminTab === 'dashboard' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-400'}`}>미션 설정</button>
                <button onClick={() => setAdminTab('manual')} className={`pb-2 px-6 text-sm font-black transition-all ${adminTab === 'manual' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-400'}`}>구매목록</button>
                <button onClick={() => setAdminTab('reviewComplete')} className={`pb-2 px-6 text-sm font-black transition-all ${adminTab === 'reviewComplete' ? 'border-b-4 border-orange-500 text-orange-500' : 'text-gray-400'}`}>후기목록</button>
                <button onClick={() => setAdminTab('productPrices')} className={`pb-2 px-6 text-sm font-black transition-all ${adminTab === 'productPrices' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-400'}`}>품목금액</button>
                <button onClick={() => setAdminTab('deposit')} className={`pb-2 px-6 text-sm font-black transition-all ${adminTab === 'deposit' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-400'}`}>입금 관리</button>
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
                              const promises = Array.from(selectedReviewIds).map(id => deleteDoc(doc(db, 'reviewEntries', id)));
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
                              .map(e => updateDoc(doc(db, 'manualEntries', e.id), { beforeDeposit: true, afterDeposit: false }));

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
                                  onClick={() => setPreviewImage(entry.image)}
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
                          <button onClick={downloadBeforeDepositCsv} className="px-5 py-2 rounded-xl text-sm font-black bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">
                            엑셀 다운 📥
                          </button>
                          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl">
                            <input type="date" value={depositActionDate} onChange={e => setDepositActionDate(e.target.value)} className="bg-transparent text-xs font-bold outline-none px-2 text-gray-600" />
                            <button
                              onClick={handleBulkDepositComplete}
                              className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${selectedDepositIds.size > 0 ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
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
                        const limitDateStr = limitDate.toISOString().split('T')[0];

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
                        <table className="w-full text-center">
                          <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase">
                            <tr>
                              <th className="p-2 w-10">
                                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={allSelected} onChange={() => {
                                  if (allSelected) {
                                    setSelectedDepositIds(new Set());
                                  } else {
                                    setSelectedDepositIds(new Set(beforeItems.map(e => e.id)));
                                  }
                                }} />
                              </th>
                              <th className="p-2">날짜</th>
                              <th className="p-2">이름1</th>
                              <th className="p-2">이름2</th>
                              <th className="p-2">주문번호</th>
                              <th className="p-2">결제금액</th>
                              <th className="p-2">계좌번호</th>
                              <th className="p-2 w-16">해제</th>
                            </tr>
                          </thead>
                          <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                            {beforeItems.map((entry, idx) => (
                              <tr key={entry.id}
                                className={`transition-colors cursor-default ${selectedDepositIds.has(entry.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onMouseDown={(e) => {
                                  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') return;
                                  isDraggingRef.current = true;
                                  dragStartIndexRef.current = idx;
                                  const next = new Set(selectedDepositIds);
                                  if (!e.shiftKey) next.clear();
                                  next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                  setSelectedDepositIds(next);
                                }}
                                onMouseEnter={() => {
                                  if (!isDraggingRef.current) return;
                                  const start = Math.min(dragStartIndexRef.current, idx);
                                  const end = Math.max(dragStartIndexRef.current, idx);
                                  const next = new Set<string>();
                                  for (let i = start; i <= end; i++) {
                                    if (beforeItems[i]) next.add(beforeItems[i].id);
                                  }
                                  setSelectedDepositIds(next);
                                }}
                              >
                                <td className="p-1">
                                  <input type="checkbox" className="w-3 h-3 accent-blue-600" checked={selectedDepositIds.has(entry.id)} onChange={() => {
                                    const next = new Set(selectedDepositIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedDepositIds(next);
                                  }} />
                                </td>
                                <td className="p-1">
                                  {entry.isManualCheck && <span className="inline-block px-1 py-0.5 rounded bg-orange-100 text-orange-600 text-[9px] font-black mr-0.5">수동</span>}
                                  {entry.date}
                                </td>
                                <td className="p-1">{entry.name1}</td>
                                <td className="p-1">{entry.name2}</td>
                                <td className="p-1 text-blue-600 font-black">{entry.orderNumber}</td>
                                <td className="p-1">{entry.paymentAmount ? entry.paymentAmount.toLocaleString() + '원' : ''}</td>
                                <td className="p-1 text-blue-600">{entry.accountNumber}</td>
                                <td className="p-1">
                                  <button onClick={() => handleDepositRelease(entry.id, 'before')} className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded-lg text-[9px] font-black hover:bg-red-100 transition-all mr-0.5">해제</button>
                                  <button onClick={() => handleDepositDelete(entry.id)} className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-lg text-[9px] font-black hover:bg-gray-200 transition-all">삭제</button>
                                </td>
                              </tr>
                            ))}
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
                        const limitDateStr = limitDate.toISOString().split('T')[0];

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
                      const allAfterSelected = afterItems.length > 0 && afterItems.every(e => selectedDepositIds.has(e.id));
                      return (
                        <table className="w-full text-center">
                          <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase">
                            <tr>
                              <th className="p-2 w-10">
                                <input type="checkbox" className="w-4 h-4 accent-green-600" checked={allAfterSelected} onChange={() => {
                                  if (allAfterSelected) {
                                    setSelectedDepositIds(new Set());
                                  } else {
                                    setSelectedDepositIds(new Set(afterItems.map(e => e.id)));
                                  }
                                }} />
                              </th>
                              <th className="p-2">날짜</th>
                              <th className="p-2 text-blue-600">입금날짜</th>
                              <th className="p-2">이름1</th>
                              <th className="p-2">이름2</th>
                              <th className="p-2">주문번호</th>
                              <th className="p-2">결제금액</th>
                              <th className="p-2">계좌번호</th>
                              <th className="p-2 w-16">해제</th>
                            </tr>
                          </thead>
                          <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                            {afterItems.map((entry, idx) => (
                              <tr key={entry.id}
                                className={`transition-colors cursor-default ${selectedDepositIds.has(entry.id) ? 'bg-red-50' : 'bg-green-50/30'}`}
                                onMouseDown={(e) => {
                                  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') return;
                                  isDraggingRef.current = true;
                                  dragStartIndexRef.current = idx;
                                  const next = new Set(selectedDepositIds);
                                  if (!e.shiftKey) next.clear();
                                  next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                  setSelectedDepositIds(next);
                                }}
                                onMouseEnter={() => {
                                  if (!isDraggingRef.current) return;
                                  const start = Math.min(dragStartIndexRef.current, idx);
                                  const end = Math.max(dragStartIndexRef.current, idx);
                                  const next = new Set<string>();
                                  for (let i = start; i <= end; i++) {
                                    if (afterItems[i]) next.add(afterItems[i].id);
                                  }
                                  setSelectedDepositIds(next);
                                }}
                              >
                                <td className="p-1">
                                  <input type="checkbox" className="w-3 h-3 accent-green-600" checked={selectedDepositIds.has(entry.id)} onChange={() => {
                                    const next = new Set(selectedDepositIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedDepositIds(next);
                                  }} />
                                </td>
                                <td className="p-1">{entry.date}</td>
                                <td className="p-1 text-blue-600">{entry.depositDate || '-'}</td>
                                <td className="p-1">{entry.name1}</td>
                                <td className="p-1">{entry.name2}</td>
                                <td className="p-1 text-blue-600 font-black">{entry.orderNumber}</td>
                                <td className="p-1">{entry.paymentAmount ? entry.paymentAmount.toLocaleString() + '원' : ''}</td>
                                <td className="p-1 text-blue-600">{entry.accountNumber}</td>
                                <td className="p-1">
                                  <button onClick={() => handleDepositRelease(entry.id, 'after')} className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded-lg text-[9px] font-black hover:bg-red-100 transition-all mr-0.5">해제</button>
                                  <button onClick={() => handleDepositDelete(entry.id)} className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-lg text-[9px] font-black hover:bg-gray-200 transition-all">삭제</button>
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
              ) : adminTab === 'productPrices' ? (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl p-8 animate-in slide-in-from-right-10 duration-500">
                  <h2 className="text-xl font-black text-gray-900 mb-6">품목금액</h2>

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
                        await addDoc(collection(db, 'productPrices'), { ...newProductPrice, id: Date.now().toString() });
                        setNewProductPrice({ name: '', price: 0 });
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                      추가
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-center">
                      <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase">
                        <tr>
                          <th className="p-4 rounded-tl-xl">No.</th>
                          <th className="p-4 text-left">품목명</th>
                          <th className="p-4">가격</th>
                          <th className="p-4 text-gray-300">공급가</th>
                          <th className="p-4 text-gray-300">판매가</th>
                          <th className="p-4 text-gray-300">마진</th>
                          <th className="p-4 rounded-tr-xl w-24">관리</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-bold divide-y divide-gray-100">
                        {productPrices.map((price, idx) => (
                          <tr key={price.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 text-gray-300">{idx + 1}</td>
                            <td className="p-4 text-left">
                              <input
                                type="text"
                                value={price.name}
                                onChange={(e) => updateDoc(doc(db, 'productPrices', price.id), { name: e.target.value })}
                                className="w-full bg-transparent outline-none font-bold text-gray-900 border-b border-transparent focus:border-blue-500 transition-colors"
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                value={price.price}
                                onChange={(e) => updateDoc(doc(db, 'productPrices', price.id), { price: Number(e.target.value) })}
                                className="w-full bg-transparent outline-none text-blue-600 font-bold text-center border-b border-transparent focus:border-blue-500 transition-colors"
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                value={price.supplyPrice || ''}
                                onChange={(e) => updateDoc(doc(db, 'productPrices', price.id), { supplyPrice: Number(e.target.value) })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                value={price.sellingPrice || ''}
                                onChange={(e) => updateDoc(doc(db, 'productPrices', price.id), { sellingPrice: Number(e.target.value) })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="p-4">
                              <input
                                type="number"
                                value={price.margin || ''}
                                onChange={(e) => updateDoc(doc(db, 'productPrices', price.id), { margin: Number(e.target.value) })}
                                className="w-full bg-transparent outline-none text-gray-400 font-normal text-center border-b border-transparent focus:border-gray-400 transition-colors"
                                placeholder="-"
                              />
                            </td>
                            <td className="p-4">
                              <button
                                onClick={async () => {
                                  if (window.confirm("삭제하시겠습니까?")) {
                                    await deleteDoc(doc(db, 'productPrices', price.id));
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
                          <tr><td colSpan={7} className="p-16 text-gray-300">등록된 품목금액이 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="bg-white rounded-[32px] border border-gray-100 shadow-2xl animate-in slide-in-from-right-10 duration-500">
                  <div className="p-6 bg-white border-b sticky left-0 z-30 space-y-3">
                    <div className="flex justify-between items-center">
                      <h2 className="text-xl font-black text-gray-900">구매목록</h2>
                      <div className="flex gap-2">
                        {/* ✅ 구매목록 검색 (변경 사항 7) */}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="검색 (이름, 주문번호...)"
                            className="px-3 py-2 bg-gray-50 rounded-xl text-xs font-bold outline-none border border-gray-200 focus:border-blue-500 w-48"
                            value={manualSearch}
                            onChange={e => setManualSearch(e.target.value)}
                          />
                        </div>
                        {selectedManualIds.size > 0 && (<>
                          <button onClick={deleteSelectedManualEntries} className="px-5 py-2.5 bg-red-100 text-red-600 rounded-xl font-black text-xs hover:bg-red-200 transition-colors">삭제 ({selectedManualIds.size})</button>
                          <button
                            onClick={async () => {
                              if (selectedManualIds.size === 0) return;
                              if (!window.confirm(`${selectedManualIds.size}건의 계좌번호를 김성아 계좌로 변경하시겠습니까?`)) return;
                              try {
                                const batch = writeBatch(db);
                                selectedManualIds.forEach(id => {
                                  batch.update(doc(db, 'manualEntries', id), { accountNumber: '국민 228 002 04 129095 김성아' });
                                });
                                await batch.commit();
                                alert('변경되었습니다.');
                              } catch (e) {
                                console.error(e);
                                alert('오류가 발생했습니다: ' + e);
                              }
                            }}
                            className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-black text-xs hover:bg-purple-700 transition-colors"
                          >
                            성아
                          </button>
                          <button onClick={handleReservationComplete} className="px-5 py-2.5 bg-pink-500 text-white rounded-xl font-black text-xs hover:bg-pink-600 transition-colors">
                            예약완료
                          </button>
                          <button onClick={handleReservationCancel} className="px-5 py-2.5 bg-pink-100 text-pink-600 rounded-xl font-black text-xs hover:bg-pink-200 transition-colors">
                            예약취소
                          </button>
                        </>)}
                        <button onClick={downloadManualCsv} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors" title="엑셀 내보내기"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>
                        {undoStack.length > 0 && (
                          <button onClick={handleUndo} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors" title="실행취소"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg></button>
                        )}
                        {redoStack.length > 0 && (
                          <button onClick={handleRedo} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors" title="다시실행"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4m4 4l-4 4" /></svg></button>
                        )}
                        <button onClick={() => addMoreRows(10)} className="px-5 py-2.5 bg-black text-white rounded-xl font-black text-xs">+ 10줄 추가</button>
                        <button onClick={() => multiImageInputRef.current?.click()} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs hover:bg-blue-700 transition-colors">이미지 일괄등록</button>
                        <input ref={multiImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleMultiImageUpload} />
                      </div>
                    </div>
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
                  <div className="overflow-x-auto relative scrollbar-hide"
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
                    <table className="w-full border-collapse min-w-[1100px] table-fixed text-center text-[12px]">
                      <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                        <tr className="text-[9px] font-black uppercase text-gray-400">
                          <th className="py-1 px-1 border-r w-8 sticky left-0 bg-gray-50 z-30 resize-x overflow-hidden">
                            <input type="checkbox" className="w-3 h-3 accent-blue-600"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const visibleIds = manualEntries.filter(entry => {
                                    if (!entry) return false;
                                    if (manualViewDateStart !== 'all') {
                                      if (entry.date < manualViewDateStart || entry.date > manualViewDateEnd) return false;
                                    }
                                    if (debouncedManualSearch) {
                                      const q = debouncedManualSearch.toLowerCase();
                                      return (entry.name1 || '').toLowerCase().includes(q)
                                        || (entry.name2 || '').toLowerCase().includes(q)
                                        || (entry.orderNumber || '').toLowerCase().includes(q)
                                        || (entry.product || '').toLowerCase().includes(q)
                                        || (entry.accountNumber || '').toLowerCase().includes(q);
                                    }
                                    return true;
                                  }).slice(0, 200).map(e => e.id);
                                  setSelectedManualIds(new Set(visibleIds));
                                } else {
                                  setSelectedManualIds(new Set());
                                }
                              }}
                            />
                          </th>
                          <th className="py-1 px-1 border-r w-8 resize-x overflow-hidden">사진</th>
                          <th className="py-1 px-1 border-r w-7 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('id')}>순번 {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-8 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('count')}>갯수 {sortConfig?.key === 'count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-16 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('product')}>품목 {sortConfig?.key === 'product' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-20 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>날짜 {sortConfig?.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-14 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name1')}>이름1 {sortConfig?.key === 'name1' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-14 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name2')}>받는사람 {sortConfig?.key === 'name2' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-20 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orderNumber')}>주문번호 {sortConfig?.key === 'orderNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-16 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('address')}>받는주소 {sortConfig?.key === 'address' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-14 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('memo')}>비고 {sortConfig?.key === 'memo' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-14 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('paymentAmount')}>결제금액 {sortConfig?.key === 'paymentAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-16 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('emergencyContact')}>연락처 {sortConfig?.key === 'emergencyContact' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-28 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('accountNumber')}>계좌번호 {sortConfig?.key === 'accountNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-20 resize-x overflow-hidden cursor-pointer hover:bg-gray-100" onClick={() => handleSort('trackingNumber')}>송장번호 {sortConfig?.key === 'trackingNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                          <th className="py-1 px-1 border-r w-8 resize-x overflow-hidden text-blue-600">입금전</th>
                          <th className="py-1 px-1 border-r w-8 resize-x overflow-hidden text-green-600">입금후</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                        {(() => {
                          // 3개월 전 날짜 계산 (검색 최적화)
                          const limitDate = new Date();
                          limitDate.setMonth(limitDate.getMonth() - 3);
                          const limitDateStr = limitDate.toISOString().split('T')[0];

                          const filtered = manualEntries.filter(entry => {
                            if (!entry) return false;

                            // 검색 시 동작: 날짜 필터 무시하고 3개월 이내 데이터 전체 검색
                            if (debouncedManualSearch) {
                              if (entry.date < limitDateStr) return false;

                              const q = debouncedManualSearch.toLowerCase();
                              return String(entry.name1 || '').toLowerCase().includes(q)
                                || String(entry.name2 || '').toLowerCase().includes(q)
                                || String(entry.orderNumber || '').toLowerCase().includes(q)
                                || String(entry.product || '').toLowerCase().includes(q)
                                || String(entry.accountNumber || '').toLowerCase().includes(q);
                            }

                            // 일반 조회 시: 날짜 범위로 필터링
                            if (manualViewDateStart !== 'all') {
                              if (entry.date < manualViewDateStart || entry.date > manualViewDateEnd) return false;
                            }

                            return true;
                          });

                          const limited = filtered.slice(0, 200);
                          return (<>
                            {limited.map((entry, idx) => {
                              const isBlue = entry.afterDeposit;
                              const rowColor = isBlue ? 'text-blue-600' : '';
                              const isPink = entry.reservationComplete;
                              return (
                                <tr key={entry.id}
                                  className={`group hover:bg-blue-50/20 transition-colors ${isBlue ? 'bg-blue-50/30' : ''}`}
                                  onMouseDown={(e) => {
                                    const tag = (e.target as HTMLElement).tagName;
                                    if (tag === 'INPUT' || tag === 'SELECT') return;
                                    isDraggingRef.current = true;
                                    dragStartIndexRef.current = idx;
                                    const next = new Set(selectedManualIds);
                                    if (!e.shiftKey) next.clear();
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedManualIds(next);
                                  }}
                                  onMouseEnter={() => {
                                    if (!isDraggingRef.current) return;
                                    const start = Math.min(dragStartIndexRef.current, idx);
                                    const end = Math.max(dragStartIndexRef.current, idx);
                                    const next = new Set<string>();
                                    for (let i = start; i <= end; i++) {
                                      if (limited[i]) next.add(limited[i].id);
                                    }
                                    setSelectedManualIds(next);
                                  }}
                                >
                                  <td className="p-1 border-r text-center sticky left-0 bg-white z-20">
                                    <input type="checkbox" className="w-3 h-3 accent-blue-600"
                                      checked={selectedManualIds.has(entry.id)}
                                      onChange={() => {
                                        const next = new Set(selectedManualIds);
                                        next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                        setSelectedManualIds(next);
                                      }}
                                    />
                                  </td>
                                  <td className="p-0.5 border-r"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleManualImageDrop(entry.id, e)}
                                  >
                                    <div className="relative h-6 w-6 mx-auto group/img">
                                      {entry.proofImage ? (
                                        <>
                                          <img src={entry.proofImage} onClick={() => setPreviewImage(entry.proofImage)} className="w-full h-full object-cover rounded-md border cursor-pointer" />
                                          <button
                                            onClick={(e) => { e.stopPropagation(); updateManualEntry(entry.id, 'proofImage', ''); }}
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"
                                          >&times;</button>
                                        </>
                                      ) : (
                                        <label className="cursor-pointer block w-full h-full">
                                          <div className="w-full h-full bg-gray-50 rounded-md border-2 border-dashed border-gray-100 flex items-center justify-center text-[8px] text-gray-300">UP</div>
                                          <input type="file" className="hidden" onChange={(e) => handleManualImageUpload(entry.id, e)} />
                                        </label>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-0.5 border-r text-center text-gray-400 text-[10px]">{idx + 1}</td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.count > 0 ? entry.count : '')} data-row={idx} data-col={0} defaultValue={entry.count > 0 ? entry.count : ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'count', idx, 0)} type="number" className={`excel-input ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'count')} /></td>
                                  <td className="p-0 border-r">
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
                                  <td className="p-0 border-r"><input data-row={idx} data-col={2} type="date" className={`excel-input px-1 ${rowColor}`} value={entry.date} onChange={e => updateManualEntry(entry.id, 'date', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.name1)} data-row={idx} data-col={3} defaultValue={entry.name1} onKeyDown={(e) => handleCellKeyDown(e, entry, 'name1', idx, 3)} type="text" className={`excel-input text-center ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'name1')} /></td>
                                  <td className={`p-0 border-r ${isPink ? 'bg-pink-100' : ''}`}><input ref={(el) => syncInputValue(el, entry.name2)} data-row={idx} data-col={4} defaultValue={entry.name2} onKeyDown={(e) => handleCellKeyDown(e, entry, 'name2', idx, 4)} type="text" className={`excel-input text-center ${isPink ? 'text-pink-600 font-black' : rowColor}`} placeholder="받는사람" onBlur={(e) => handleCellBlur(e, entry, 'name2')} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.orderNumber)} data-row={idx} data-col={5} defaultValue={entry.orderNumber} onKeyDown={(e) => handleCellKeyDown(e, entry, 'orderNumber', idx, 5)} type="text" className={`excel-input text-center ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'orderNumber')} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.address)} data-row={idx} data-col={6} defaultValue={entry.address} onKeyDown={(e) => handleCellKeyDown(e, entry, 'address', idx, 6)} type="text" className={`excel-input text-[11px] ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'address')} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.memo)} data-row={idx} data-col={7} defaultValue={entry.memo} onKeyDown={(e) => handleCellKeyDown(e, entry, 'memo', idx, 7)} type="text" className={`excel-input text-[11px] font-normal ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'memo')} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => { if (el && document.activeElement !== el) { el.value = entry.paymentAmount ? entry.paymentAmount.toLocaleString() : ''; } }} data-row={idx} data-col={8} defaultValue={entry.paymentAmount ? entry.paymentAmount.toLocaleString() : ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'paymentAmount', idx, 8)} type="text" className={`excel-input text-center ${rowColor}`} onFocus={(e) => { e.target.value = entry.paymentAmount ? String(entry.paymentAmount) : ''; e.target.select(); }} onBlur={(e) => { const raw = Number(e.target.value.replace(/,/g, '')) || 0; if (raw !== (entry.paymentAmount || 0)) updateManualEntry(entry.id, 'paymentAmount', raw); e.target.value = raw ? raw.toLocaleString() : ''; }} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.emergencyContact)} data-row={idx} data-col={9} defaultValue={entry.emergencyContact} onKeyDown={(e) => handleCellKeyDown(e, entry, 'emergencyContact', idx, 9)} type="text" className={`excel-input ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'emergencyContact')} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.accountNumber)} data-row={idx} data-col={10} defaultValue={entry.accountNumber} onKeyDown={(e) => handleCellKeyDown(e, entry, 'accountNumber', idx, 10)} type="text" className={`excel-input ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'accountNumber')} /></td>
                                  <td className="p-0 border-r"><input ref={(el) => syncInputValue(el, entry.trackingNumber || '')} data-row={idx} data-col={11} defaultValue={entry.trackingNumber || ''} onKeyDown={(e) => handleCellKeyDown(e, entry, 'trackingNumber', idx, 11)} type="text" className={`excel-input ${rowColor}`} onBlur={(e) => handleCellBlur(e, entry, 'trackingNumber')} /></td>
                                  <td className="p-0 border-r text-center align-middle">
                                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={entry.beforeDeposit} onChange={() => toggleBeforeDeposit(entry.id, entry.beforeDeposit)} />
                                  </td>
                                  <td className="p-0 text-center align-middle">
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
        .excel-input {
          width: 100%;
          height: 100%;
          min-height: 20px;
          padding: 1px 3px;
          border: 1px solid transparent;
          background: transparent;
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          outline: none;
        }
        .excel-input:focus {
          background: white;
          border-color: #0071E3;
          box-shadow: 0 0 10px rgba(0,113,227,0.1);
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        table tbody tr { user-select: none; -webkit-user-select: none; }
        table tbody tr input, table tbody tr button { user-select: auto; -webkit-user-select: auto; }
      `}</style>
    </div>
  );
};

export default App;