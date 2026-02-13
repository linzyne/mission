import React, { useState, useEffect, useRef } from 'react';
import { Product, Submission, AppMode, CustomerView, AppSettings, AdminTab, ManualEntry, ReviewEntry, ProductPrice } from './types';
import { verifyImage } from './services/geminiService';
import { db } from './services/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, query, orderBy, writeBatch } from 'firebase/firestore';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('customer');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [customerView, setCustomerView] = useState<CustomerView>('landing');

  const [adminPassword, setAdminPassword] = useState('');
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
    afterDeposit: false
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
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ManualEntry));
      list.sort((a, b) => b.date.localeCompare(a.date));
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
  const [manualViewDate, setManualViewDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedManualIds, setSelectedManualIds] = useState<Set<string>>(new Set());

  const [depositBeforeDate, setDepositBeforeDate] = useState<string>('all');
  const [depositAfterDate, setDepositAfterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [depositActionDate, setDepositActionDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [manualSearch, setManualSearch] = useState('');

  const [depositSearch, setDepositSearch] = useState('');
  const [debouncedDepositSearch, setDebouncedDepositSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ManualEntry; direction: 'asc' | 'desc' } | null>(null);

  const [manualCalOpen, setManualCalOpen] = useState(false);
  const [manualCalMonth, setManualCalMonth] = useState(new Date());
  const [depositCalOpen, setDepositCalOpen] = useState(false);
  const [depositCalMonth, setDepositCalMonth] = useState(new Date());


  // ✅ 디바운스 로직 - 입금관리 검색 (변경 사항 3)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDepositSearch(depositSearch);
    }, 300);

    return () => clearTimeout(timer);
  }, [depositSearch]);

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

  const handleLotteDownload = async () => {
    const selectedEntries = manualEntries.filter(entry => selectedManualIds.has(entry.id));
    if (selectedEntries.length === 0) return alert("선택된 항목이 없습니다.");

    try {
      const XLSX = await import('xlsx');

      const lotteData = selectedEntries.map(entry => ({
        '주문번호': entry.orderNumber || '',
        '보내는사람(지정)': '안군농원',
        '전화번호1(지정)': '01042626343',
        '전화번호2(지정)': '',
        '우편번호(지정)': '',
        '주소(지정)': '인천시 연수구 송도동 214, D동 2206-1호',
        '받는사람': entry.name2 || '',
        '전화번호1': entry.emergencyContact || '',
        '전화번호2': '',
        '우편번호': '',
        '주소': entry.address || '',
        '상품명1': '완구류',
        '상품상세1': '',
        '수량(A타입)': '',
        '배송메시지': entry.memo || '',
        '운임구분': '',
        '운임': '',
        '운송장번호': ''
      }));

      const ws = XLSX.utils.json_to_sheet(lotteData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "롯데택배발송");
      XLSX.writeFile(wb, `롯데택배_발송목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error("Excel Error:", e);
      alert("엑셀 처리 중 오류가 발생했습니다.");
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
    const promises = Array.from({ length: count }).map(() => {
      const newRow = createEmptyRow(manualViewDate);
      return setDoc(doc(db, 'manualEntries', newRow.id), newRow);
    });
    await Promise.all(promises);
  };

  const updateManualEntry = async (id: string, field: keyof ManualEntry, value: any) => {
    const entry = manualEntries.find(e => e.id === id);
    if (!entry) return;

    const updates: Partial<ManualEntry> = { [field]: value };

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

        setManualEntries(prev => prev.map(entry => {
          if (entry.id !== id) return entry;
          const updated = { ...entry };
          if (result.orderNumber) updated.orderNumber = result.orderNumber;
          if (result.receiverName) updated.name2 = result.receiverName;
          else if (result.ordererName) updated.name2 = result.ordererName;
          if (result.address) updated.address = result.address;
          if (result.phone) updated.emergencyContact = result.phone;
          return updated;
        }));
      } catch (err) {
        console.error('[Upload OCR] 실패:', err);
      }
    };
    reader.readAsDataURL(file);
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

  const downloadBeforeDepositCsv = () => {
    const beforeItems = manualEntries.filter(e => e.beforeDeposit && !e.afterDeposit);
    if (beforeItems.length === 0) return;
    const rows = beforeItems.map(e => {
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
    link.download = `입금전_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const downloadManualCsv = () => {
    const headers = ["구매인증샷", "갯수", "품목", "날짜", "이름1", "이름2/주문자명", "주문번호", "주소", "비고", "결제금액", "계좌번호", "입금전", "입금후"];
    const rows = manualEntries.filter(e => e.product || e.name1 || e.ordererName).map(e => [
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

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="min-h-screen bg-[#FBFBFD] font-sans text-[#1D1D1F] antialiased">
      {/* Lightbox Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95 duration-200" alt="Preview" />
          <button className="absolute top-6 right-6 text-white text-4xl font-light">&times;</button>
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-center">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase">
                          <tr>
                            <th className="p-4 w-12">
                              <input type="checkbox" className="w-5 h-5 accent-blue-600"
                                checked={reviewEntries.length > 0 && selectedReviewIds.size === reviewEntries.length}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedReviewIds(new Set(reviewEntries.map(e => e.id)));
                                  else setSelectedReviewIds(new Set());
                                }}
                              />
                            </th>
                            <th className="p-4 w-12">No.</th>
                            <th className="p-4 w-32">인증 이미지</th>
                            <th className="p-4">주문번호</th>
                            <th className="p-4">주문자명</th>
                            <th className="p-4">은행명</th>
                            <th className="p-4">계좌번호</th>
                            <th className="p-4">이름</th>
                            <th className="p-4">제출일</th>
                          </tr>
                        </thead>
                        <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                          {reviewEntries.map((entry, idx) => (
                            <tr key={entry.id} className={`hover:bg-orange-50/30 transition-colors ${selectedReviewIds.has(entry.id) ? 'bg-blue-50' : ''}`}>
                              <td className="p-2">
                                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                                  checked={selectedReviewIds.has(entry.id)}
                                  onChange={() => {
                                    const next = new Set(selectedReviewIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedReviewIds(next);
                                  }}
                                />
                              </td>
                              <td className="p-2 text-gray-300">{idx + 1}</td>
                              <td className="p-1">
                                <img
                                  src={entry.image}
                                  className="w-8 h-8 object-cover rounded-lg border border-gray-100 mx-auto cursor-pointer hover:scale-150 transition-transform origin-center z-10 relative"
                                  onClick={() => setPreviewImage(entry.image)}
                                  alt="후기 인증"
                                />
                              </td>
                              <td className="p-2 text-blue-600 font-black">{entry.orderNumber || <span className="text-gray-300 font-normal">미인식</span>}</td>
                              <td className="p-2">{entry.ordererName || <span className="text-gray-300 font-normal">미인식</span>}</td>
                              {(() => {
                                const parts = (entry.bankInfo || '').split(/[\/\s]+/).filter(Boolean);
                                return (<>
                                  <td className="p-2">{parts[0] || <span className="text-gray-300 font-normal">-</span>}</td>
                                  <td className="p-2 text-blue-600">{parts[1] || <span className="text-gray-300 font-normal">-</span>}</td>
                                  <td className="p-2">{parts[2] || <span className="text-gray-300 font-normal">-</span>}</td>
                                </>);
                              })()}
                              <td className="p-2 text-gray-400">{entry.date}</td>
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
                  <div className="overflow-x-auto">
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
                              <th className="p-4 w-12">
                                <input type="checkbox" className="w-5 h-5 accent-blue-600" checked={allSelected} onChange={() => {
                                  if (allSelected) {
                                    setSelectedDepositIds(new Set());
                                  } else {
                                    setSelectedDepositIds(new Set(beforeItems.map(e => e.id)));
                                  }
                                }} />
                              </th>
                              <th className="p-4">날짜</th>
                              <th className="p-4">이름1</th>
                              <th className="p-4">이름2</th>
                              <th className="p-4">주문번호</th>
                              <th className="p-4">결제금액</th>
                              <th className="p-4">계좌번호</th>
                              <th className="p-4 w-16">해제</th>
                            </tr>
                          </thead>
                          <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                            {beforeItems.map(entry => (
                              <tr key={entry.id} className={`transition-colors ${selectedDepositIds.has(entry.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <td className="p-2">
                                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={selectedDepositIds.has(entry.id)} onChange={() => {
                                    const next = new Set(selectedDepositIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedDepositIds(next);
                                  }} />
                                </td>
                                <td className="p-2">
                                  {entry.isManualCheck && <span className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 text-[10px] font-black mr-1">수동</span>}
                                  {entry.date}
                                </td>
                                <td className="p-2">{entry.name1}</td>
                                <td className="p-2">{entry.name2}</td>
                                <td className="p-2 text-blue-600 font-black">{entry.orderNumber}</td>
                                <td className="p-2">{entry.paymentAmount ? entry.paymentAmount.toLocaleString() + '원' : ''}</td>
                                <td className="p-2 text-blue-600">{entry.accountNumber}</td>
                                <td className="p-2">
                                  <button onClick={() => handleDepositRelease(entry.id, 'before')} className="px-2 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-100 transition-all">해제</button>
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
                              <th className="p-4 w-12">
                                <input type="checkbox" className="w-5 h-5 accent-green-600" checked={allAfterSelected} onChange={() => {
                                  if (allAfterSelected) {
                                    setSelectedDepositIds(new Set());
                                  } else {
                                    setSelectedDepositIds(new Set(afterItems.map(e => e.id)));
                                  }
                                }} />
                              </th>
                              <th className="p-4">날짜</th>
                              <th className="p-4 text-blue-600">입금날짜</th>
                              <th className="p-4">이름1</th>
                              <th className="p-4">이름2</th>
                              <th className="p-4">주문번호</th>
                              <th className="p-4">결제금액</th>
                              <th className="p-4">계좌번호</th>
                              <th className="p-4 w-16">해제</th>
                            </tr>
                          </thead>
                          <tbody className="text-[11px] font-bold divide-y divide-gray-100">
                            {afterItems.map(entry => (
                              <tr key={entry.id} className={`transition-colors ${selectedDepositIds.has(entry.id) ? 'bg-red-50' : 'bg-green-50/30'}`}>
                                <td className="p-2">
                                  <input type="checkbox" className="w-4 h-4 accent-green-600" checked={selectedDepositIds.has(entry.id)} onChange={() => {
                                    const next = new Set(selectedDepositIds);
                                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                    setSelectedDepositIds(next);
                                  }} />
                                </td>
                                <td className="p-2">{entry.date}</td>
                                <td className="p-2 text-blue-600">{entry.depositDate || '-'}</td>
                                <td className="p-2">{entry.name1}</td>
                                <td className="p-2">{entry.name2}</td>
                                <td className="p-2 text-blue-600 font-black">{entry.orderNumber}</td>
                                <td className="p-2">{entry.paymentAmount ? entry.paymentAmount.toLocaleString() + '원' : ''}</td>
                                <td className="p-2 text-blue-600">{entry.accountNumber}</td>
                                <td className="p-2">
                                  <button onClick={() => handleDepositRelease(entry.id, 'after')} className="px-2 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-100 transition-all">해제</button>
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
                          <tr><td colSpan={4} className="p-16 text-gray-300">등록된 품목금액이 없습니다.</td></tr>
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
                        {selectedManualIds.size > 0 && (
                          <button onClick={deleteSelectedManualEntries} className="px-5 py-2.5 bg-red-100 text-red-600 rounded-xl font-black text-xs hover:bg-red-200 transition-colors">삭제 ({selectedManualIds.size})</button>
                        )}
                        <button onClick={downloadManualCsv} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-black text-xs">내보내기 📥</button>
                        <button onClick={handleLotteDownload} className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-black text-xs hover:bg-red-700 transition-colors flex items-center shadow-lg shadow-red-200">
                          롯데예약 🚚
                        </button>
                        <button onClick={() => addMoreRows(10)} className="px-5 py-2.5 bg-black text-white rounded-xl font-black text-xs">+ 10줄 추가</button>
                      </div>
                    </div>
                    <div>
                      {renderDatePicker(
                        manualViewDate, setManualViewDate,
                        manualCalOpen, setManualCalOpen,
                        manualCalMonth, setManualCalMonth,
                        manualEntries.reduce((acc, e) => {
                          if (e.date) acc[e.date] = (acc[e.date] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto relative scrollbar-hide">
                    <table className="w-full border-collapse min-w-[1100px] table-fixed text-center text-[12px]">
                      <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                        <tr className="text-[9px] font-black uppercase text-gray-400">
                          <th className="py-1 px-1 border-r w-8 sticky left-0 bg-gray-50 z-30 resize-x overflow-hidden">
                            <input type="checkbox" className="w-3 h-3 accent-blue-600"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const visibleIds = manualEntries.filter(entry => {
                                    if (!entry) return false;
                                    if (manualViewDate !== 'all' && entry.date !== manualViewDate) return false;
                                    if (manualSearch) {
                                      const q = manualSearch.toLowerCase();
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
                            if (manualSearch) {
                              if (entry.date < limitDateStr) return false;

                              const q = manualSearch.toLowerCase();
                              return String(entry.name1 || '').toLowerCase().includes(q)
                                || String(entry.name2 || '').toLowerCase().includes(q)
                                || String(entry.orderNumber || '').toLowerCase().includes(q)
                                || String(entry.product || '').toLowerCase().includes(q)
                                || String(entry.accountNumber || '').toLowerCase().includes(q);
                            }

                            // 일반 조회 시: 선택된 날짜('all' 또는 특정 날짜)만 필터링
                            if (manualViewDate !== 'all' && entry.date !== manualViewDate) return false;

                            return true;
                          });

                          if (sortConfig !== null) {
                            filtered.sort((a, b) => {
                              const aValue = a[sortConfig.key] || '';
                              const bValue = b[sortConfig.key] || '';
                              if (aValue < bValue) {
                                return sortConfig.direction === 'asc' ? -1 : 1;
                              }
                              if (aValue > bValue) {
                                return sortConfig.direction === 'asc' ? 1 : -1;
                              }
                              return 0;
                            });
                          }
                          const limited = filtered.slice(0, 200);
                          return (<>
                            {limited.map((entry, idx) => {
                              const isBlue = entry.afterDeposit;
                              const rowColor = isBlue ? 'text-blue-600' : '';
                              return (
                                <tr key={entry.id} className={`group hover:bg-blue-50/20 transition-colors ${isBlue ? 'bg-blue-50/30' : ''}`}>
                                  <td className="p-2 border-r text-center sticky left-0 bg-white z-20">
                                    <input type="checkbox" className="w-3 h-3 accent-blue-600"
                                      checked={selectedManualIds.has(entry.id)}
                                      onChange={() => {
                                        const next = new Set(selectedManualIds);
                                        next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                        setSelectedManualIds(next);
                                      }}
                                    />
                                  </td>
                                  <td className="p-1 border-r"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleManualImageDrop(entry.id, e)}
                                  >
                                    <label className="cursor-pointer block relative h-7 w-7 mx-auto group/img">
                                      {entry.proofImage ? <img src={entry.proofImage} onClick={() => setPreviewImage(entry.proofImage)} className="w-full h-full object-cover rounded-md border" /> : <div className="w-full h-full bg-gray-50 rounded-md border-2 border-dashed border-gray-100 flex items-center justify-center text-[8px] text-gray-300">UP</div>}
                                      <input type="file" className="hidden" onChange={(e) => handleManualImageUpload(entry.id, e)} />
                                    </label>
                                  </td>
                                  <td className="p-1 border-r text-center text-gray-400 text-[10px]">{idx + 1}</td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={0} onKeyDown={(e) => handleKeyDown(e, idx, 0)} type="number" className={`excel-input ${rowColor}`} value={entry.count > 0 ? entry.count : ''} onChange={e => updateManualEntry(entry.id, 'count', Number(e.target.value))} /></td>
                                  <td className="p-0 border-r">
                                    <select
                                      data-row={idx}
                                      data-col={1}
                                      onKeyDown={(e) => handleKeyDown(e, idx, 1)}
                                      className={`excel-input ${rowColor} cursor-pointer`}
                                      value={entry.product}
                                      onChange={e => updateManualEntry(entry.id, 'product', e.target.value)}
                                    >
                                      <option value="">(선택)</option>
                                      {productPrices.map(p => (
                                        <option key={p.id} value={p.name}>{p.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={2} onKeyDown={(e) => handleKeyDown(e, idx, 2)} type="date" className={`excel-input px-1 ${rowColor}`} value={entry.date} onChange={e => updateManualEntry(entry.id, 'date', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={3} onKeyDown={(e) => handleKeyDown(e, idx, 3)} type="text" className={`excel-input text-center ${rowColor}`} value={entry.name1} onChange={e => updateManualEntry(entry.id, 'name1', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={4} onKeyDown={(e) => handleKeyDown(e, idx, 4)} type="text" className={`excel-input text-center ${rowColor}`} placeholder="받는사람" value={entry.name2} onChange={e => updateManualEntry(entry.id, 'name2', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={5} onKeyDown={(e) => handleKeyDown(e, idx, 5)} type="text" className={`excel-input text-center ${rowColor}`} value={entry.orderNumber} onChange={e => updateManualEntry(entry.id, 'orderNumber', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={6} onKeyDown={(e) => handleKeyDown(e, idx, 6)} type="text" className={`excel-input text-[11px] ${rowColor}`} value={entry.address} onChange={e => updateManualEntry(entry.id, 'address', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={7} onKeyDown={(e) => handleKeyDown(e, idx, 7)} type="text" className={`excel-input text-[11px] font-normal ${rowColor}`} value={entry.memo} onChange={e => updateManualEntry(entry.id, 'memo', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={8} onKeyDown={(e) => handleKeyDown(e, idx, 8)} type="text" className={`excel-input text-center ${rowColor}`} value={entry.paymentAmount ? entry.paymentAmount.toLocaleString() : ''} onChange={e => updateManualEntry(entry.id, 'paymentAmount', Number(e.target.value.replace(/,/g, '')))} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={9} onKeyDown={(e) => handleKeyDown(e, idx, 9)} type="text" className={`excel-input ${rowColor}`} value={entry.emergencyContact} onChange={e => updateManualEntry(entry.id, 'emergencyContact', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={10} onKeyDown={(e) => handleKeyDown(e, idx, 10)} type="text" className={`excel-input ${rowColor}`} value={entry.accountNumber} onChange={e => updateManualEntry(entry.id, 'accountNumber', e.target.value)} /></td>
                                  <td className="p-0 border-r"><input data-row={idx} data-col={11} onKeyDown={(e) => handleKeyDown(e, idx, 11)} type="text" className={`excel-input ${rowColor}`} value={entry.trackingNumber || ''} onChange={e => updateManualEntry(entry.id, 'trackingNumber', e.target.value)} /></td>
                                  <td className="p-0 border-r text-center align-middle">
                                    {/* ✅ Firestore 동기화 수정 (변경 사항 10) */}
                                    <input type="checkbox" className="w-5 h-5 accent-blue-600" checked={entry.beforeDeposit} onChange={async (e) => {
                                      const checked = e.target.checked;
                                      await updateDoc(doc(db, 'manualEntries', entry.id), {
                                        beforeDeposit: checked,
                                        isManualCheck: checked
                                      });
                                    }} />
                                  </td>
                                  <td className="p-0 text-center align-middle"><input type="checkbox" className="w-5 h-5 accent-green-600" checked={entry.afterDeposit} onChange={e => updateManualEntry(entry.id, 'afterDeposit', e.target.checked)} /></td>
                                </tr>
                              );
                            })}
                            {filtered.length === 0 && (
                              <tr>
                                <td colSpan={17} className="p-16 text-center text-gray-300 font-bold">
                                  {manualSearch ? `"${manualSearch}" 검색 결과가 없습니다.` : `${manualViewDate === 'all' ? '전체' : manualViewDate} 날짜에 데이터가 없습니다.`}
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
          min-height: 28px;
          padding: 2px 4px;
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
      `}</style>
    </div>
  );
};

export default App;