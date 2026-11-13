// 되돌리기 / 다시하기
// 미션허브 DB(db)에 쓰는 모든 작업을 '문서별 전·후 상태'로 기록해 두었다가 그대로 되돌림.
// App.tsx는 firebase/firestore 대신 여기서 setDoc·updateDoc·deleteDoc·addDoc·writeBatch를 가져다 씀 (같은 모양).
// 자동으로 도는 쓰기(마이그레이션·윙_발주 연동 등)는 raw 함수로 써서 기록 안 함.
import { useSyncExternalStore } from 'react';
import {
  DocumentReference, CollectionReference, DocumentSnapshot, WriteBatch,
  setDoc as rawSetDoc, updateDoc as rawUpdateDoc, deleteDoc as rawDeleteDoc,
  doc, getDoc, getDocFromCache, writeBatch as rawWriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';

type DocState = Record<string, any> | null; // null = 문서 없음
type Change = { ref: DocumentReference; before: DocState; after: DocState };
export type HistoryStep = { changes: Change[]; label: string; at: number };

const MAX_STEPS = 50;
const GROUP_MS = 600; // 이 안에 이어진 쓰기는 한 번의 작업으로 묶음 (예: 여러 줄 한꺼번에 수정)

let undoStack: HistoryStep[] = [];
let redoStack: HistoryStep[] = [];
let busy = false;
let state = { undo: undoStack, redo: redoStack, busy };
const listeners = new Set<() => void>();
const emit = () => { state = { undo: undoStack, redo: redoStack, busy }; listeners.forEach(l => l()); };

const tracked = (ref: DocumentReference) => ref.firestore === db;

const readState = async (ref: DocumentReference): Promise<DocState> => {
  let snap: DocumentSnapshot;
  try { snap = await getDocFromCache(ref); } catch { snap = await getDoc(ref); }
  return snap.exists() ? snap.data() : null;
};

// 컬렉션 이름 → 화면 이름 (사업자 접두사는 떼고 봄)
const COL_LABELS: [string, string][] = [
  ['manualEntries', '구매목록'], ['reviewEntries', '후기'], ['salesDaily', '매출'], ['productPrices', '품목'],
  ['products', '상품'], ['monthlyOverhead', '비용'], ['dailyMemos', '메모'], ['settings', '설정'],
];
const makeLabel = (changes: Change[]) => {
  const cols = new Set(changes.map(c => {
    if (c.ref.id === 'purchaseMemo') return '메모';
    const id = c.ref.parent.id;
    return COL_LABELS.find(([k]) => id.endsWith(k))?.[1] ?? id;
  }));
  const kind = changes.every(c => !c.before) ? '추가' : changes.every(c => !c.after) ? '삭제' : '수정';
  return `${[...cols].join('·')} ${changes.length}건 ${kind}`;
};

// --- 묶음(그룹) ---
let open: { changes: Map<string, Change>; inflight: number; timer: ReturnType<typeof setTimeout> | null } | null = null;

const closeGroup = () => {
  if (!open) return;
  const g = open; open = null;
  if (g.timer) clearTimeout(g.timer);
  const changes = [...g.changes.values()].filter(c => JSON.stringify(c.before) !== JSON.stringify(c.after));
  if (changes.length === 0) return;
  undoStack = [...undoStack.slice(-(MAX_STEPS - 1)), { changes, label: makeLabel(changes), at: Date.now() }];
  redoStack = [];
  emit();
};

const scheduleClose = () => {
  if (!open || open.inflight > 0) return;
  if (open.timer) clearTimeout(open.timer);
  open.timer = setTimeout(closeGroup, GROUP_MS);
};

// 쓰기 하나를 기록하며 실행: 전 상태 읽기 → 쓰기 → 후 상태 읽기
const record = async <T>(refs: DocumentReference[], write: () => Promise<T>): Promise<T> => {
  const mine = refs.filter(tracked);
  if (busy || mine.length === 0) return write();
  if (!open) open = { changes: new Map(), inflight: 0, timer: null };
  const g = open;
  if (g.timer) { clearTimeout(g.timer); g.timer = null; }
  g.inflight++;
  try {
    const befores = await Promise.all(mine.map(r => g.changes.has(r.path) ? Promise.resolve(undefined) : readState(r).catch(() => undefined)));
    const result = await write();
    const afters = await Promise.all(mine.map(r => readState(r).catch(() => undefined)));
    mine.forEach((r, i) => {
      const prev = g.changes.get(r.path);
      const after = afters[i];
      if (prev) { if (after !== undefined) prev.after = after; return; }
      if (befores[i] === undefined || after === undefined) return; // 못 읽은 문서는 기록 안 함
      g.changes.set(r.path, { ref: r, before: befores[i] as DocState, after });
    });
    return result;
  } finally {
    g.inflight--;
    if (open === g) scheduleClose();
    else if (g.inflight === 0) { open = g; closeGroup(); }
  }
};

// --- firebase/firestore 와 같은 모양의 함수들 ---
export const setDoc: typeof rawSetDoc = ((ref: DocumentReference, data: any, opts?: any) =>
  record([ref], () => opts ? rawSetDoc(ref, data, opts) : rawSetDoc(ref, data))) as any;

export const updateDoc: typeof rawUpdateDoc = ((ref: DocumentReference, ...args: any[]) =>
  record([ref], () => (rawUpdateDoc as any)(ref, ...args))) as any;

export const deleteDoc: typeof rawDeleteDoc = ((ref: DocumentReference) =>
  record([ref], () => rawDeleteDoc(ref))) as any;

export const addDoc = async (col: CollectionReference<any>, data: any): Promise<DocumentReference<any>> => {
  const ref = doc(col);
  await setDoc(ref, data);
  return ref;
};

export const writeBatch: typeof rawWriteBatch = ((fs: any) => {
  const batch = rawWriteBatch(fs);
  const refs: DocumentReference[] = [];
  const wrap = (name: 'set' | 'update' | 'delete') => {
    const orig = (batch as any)[name].bind(batch);
    (batch as any)[name] = (ref: DocumentReference, ...args: any[]) => { refs.push(ref); orig(ref, ...args); return batch; };
  };
  wrap('set'); wrap('update'); wrap('delete');
  const commit = batch.commit.bind(batch);
  batch.commit = () => record([...new Map(refs.map(r => [r.path, r])).values()], commit);
  return batch;
}) as any;

// 래퍼를 안 거친 쓰기(runTransaction 등)를 한 번의 작업으로 기록: 전 상태는 호출한 쪽이 넘김
export const recordStep = async (items: { ref: DocumentReference; before: DocState }[]) => {
  closeGroup();
  const mine = items.filter(it => tracked(it.ref));
  if (mine.length === 0) return;
  const afters = await Promise.all(mine.map(it => readState(it.ref).catch(() => undefined)));
  const changes = mine.flatMap((it, i) => afters[i] === undefined ? [] : [{ ref: it.ref, before: it.before, after: afters[i] as DocState }]);
  if (changes.length === 0) return;
  undoStack = [...undoStack.slice(-(MAX_STEPS - 1)), { changes, label: makeLabel(changes), at: Date.now() }];
  redoStack = [];
  emit();
};

// --- 되돌리기 / 다시하기 ---
const apply = async (changes: Change[], pick: 'before' | 'after') => {
  for (let i = 0; i < changes.length; i += 450) {
    const b: WriteBatch = rawWriteBatch(db);
    changes.slice(i, i + 450).forEach(c => {
      const data = c[pick];
      if (data) b.set(c.ref, data); else b.delete(c.ref);
    });
    await b.commit();
  }
};

const run = async (from: 'undo' | 'redo'): Promise<HistoryStep | null> => {
  closeGroup();
  if (busy) return null;
  const stack = from === 'undo' ? undoStack : redoStack;
  const step = stack[stack.length - 1];
  if (!step) return null;
  busy = true; emit();
  try {
    await apply(step.changes, from === 'undo' ? 'before' : 'after');
    if (from === 'undo') { undoStack = undoStack.slice(0, -1); redoStack = [...redoStack, step]; }
    else { redoStack = redoStack.slice(0, -1); undoStack = [...undoStack, step]; }
    return step;
  } catch (e) {
    console.error(`[history] ${from} 실패`, e);
    alert(`${from === 'undo' ? '되돌리기' : '다시하기'} 중 오류: ${e}`);
    return null;
  } finally {
    busy = false; emit();
  }
};

export const undo = () => run('undo');
export const redo = () => run('redo');
export const clearHistory = () => { closeGroup(); undoStack = []; redoStack = []; emit(); };

export const useHistory = () => useSyncExternalStore(
  cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  () => state,
);
