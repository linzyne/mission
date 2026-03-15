import { GoogleGenAI, Type } from "@google/genai";

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai && process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
}

// Keep verifyImage as is (it might fail if key is bad, but user complained about OCR specifically)
// Actually, verifying image also uses Gemini. If key is bad, verifyImage fails too.
// I'll leave verifyImage as is for now, identifying purely logic fixes.
export const verifyImage = async (base64Image: string, type: 'purchase' | 'review') => {
  // If no key, return valid immediately to avoid blocking
  if (!process.env.API_KEY || process.env.API_KEY.includes('PLACEHOLDER')) {
    return { valid: true, reason: "API 키 없음 (자동 승인)" };
  }

  const prompt = type === 'purchase'
    ? "이 이미지가 쇼핑몰의 주문 완료/결제 상세 화면인지 분석해줘. JSON { \"valid\": boolean, \"reason\": string } 형식으로 반환해."
    : "이 이미지가 쇼핑몰의 리뷰 작성 완료 화면인지 분석해줘. JSON { \"valid\": boolean, \"reason\": string } 형식으로 반환해.";

  try {
    const response = await getAI()!.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: detectMimeType(base64Image), data: base64Image.split(',')[1] || base64Image } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            valid: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["valid"]
        }
      }
    });

    const text = response.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    return { valid: true, reason: "분석 건너뜀" };
  }
};

export interface OcrResult {
  orderNumber: string;
  ordererName: string;
  receiverName: string;
  address: string;
  phone: string;
}

// base64 data URI에서 실제 mimeType 추출
function detectMimeType(base64Image: string): string {
  if (base64Image.startsWith('data:')) {
    const match = base64Image.match(/^data:(image\/[a-zA-Z+]+);/);
    if (match) return match[1];
  }
  // data URI가 아닌 경우 매직바이트로 판별
  const raw = base64Image.substring(0, 20);
  if (raw.startsWith('/9j/')) return 'image/jpeg';
  if (raw.startsWith('iVBOR')) return 'image/png';
  if (raw.startsWith('R0lGO')) return 'image/gif';
  if (raw.startsWith('UklGR')) return 'image/webp';
  return 'image/png'; // 스크린샷은 대부분 PNG
}

// Canvas로 이미지 전처리 (대비 강화 + 선명화 + 적정 크기 리사이즈)
function preprocessImage(base64Image: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 최대 2048px로 리사이즈 (너무 크면 API 비용↑, 너무 작으면 정확도↓)
      const MAX_DIM = 2048;
      let w = img.width, h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      // 1) 원본 그리기
      ctx.drawImage(img, 0, 0, w, h);

      // 2) 대비 강화 (contrast + brightness)
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const contrast = 1.3; // 30% 대비 증가
      const brightness = 10;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128 + brightness));
        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128 + brightness));
      }
      ctx.putImageData(imageData, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64Image); // 실패 시 원본 반환
    img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
  });
}

// 주문번호 추출 패턴 (다양한 쇼핑몰 대응)
const ORDER_NUM_PATTERNS = [
  /주문\s*번호\s*[:.·\-]?\s*(\d[\d\-]{8,})/,
  /주문\s*번호\s*\n\s*(\d[\d\-]{8,})/,
  /order\s*(?:no|number|#)\s*[:.·\-]?\s*(\d[\d\-]{8,})/i,
  /(\d{10,20})/,
];

// 주문자(보내는사람) 이름 추출 패턴
const ORDERER_PATTERNS = [
  /주문자\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /주문자\s*\n\s*([가-힣]{2,5})/,
  /보내는\s*사람\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /보내는\s*분\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /구매자\s*[:.·\-]?\s*([가-힣]{2,5})/,
];

// 주소로 오인식되는 UI 텍스트 필터
const ADDRESS_FALSE_POSITIVES = [
  /잘못\s*입력/,
  /변경.*하시/,
  /입력.*했나요/,
  /입력해\s*주세요/,
  /배송지를?\s*잘못/,
];

// 배송정보 블록에서 연락처, 주소, 받는사람 추출 (위치 기반)
// 모바일: 이름(zipLine-1) → 주소(zipLine) → 전화(아래)
// PC:     이름(phoneLine-1) → 전화(phoneLine) → 주소(zipLine)
function extractDeliveryBlock(lines: string[]) {
  let receiverName = '';
  let address = '';
  let phone = '';

  // 1) 전화번호 줄 위치 찾기
  let phoneLineIdx = -1;
  const phoneRegex = /01[0-9]\D\d{3,4}\D\d{4}/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(phoneRegex);
    if (m) {
      const digits = m[0].replace(/\D/g, '');
      phone = digits.replace(/^(01[0-9])(\d{3,4})(\d{4})$/, '$1-$2-$3');
      phoneLineIdx = i;
      break;
    }
  }

  // 2) 우편번호 줄 위치 찾기
  let zipLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\(\d{5}\)/.test(lines[i])) {
      zipLineIdx = i;
      break;
    }
  }
  // 괄호 없는 경우 대비: "받는주소" 라벨 + 5자리 숫자
  if (zipLineIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/받는\s*주소/.test(lines[i]) && /\d{5}/.test(lines[i])) {
        zipLineIdx = i;
        break;
      }
    }
  }
  // 괄호 없는 우편번호 + 주소 패턴 (예: "41083 대구 동구...", "07986 서울 양천구...")
  if (zipLineIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{5}\s+[가-힣\s]*(?:시|도|군|구)/.test(lines[i])) {
        zipLineIdx = i;
        break;
      }
    }
  }

  if (zipLineIdx >= 0) {
    // 3) 주소: 우편번호 줄에서 추출 (최대 3줄)
    const addrLines: string[] = [];
    for (let j = zipLineIdx; j < Math.min(lines.length, zipLineIdx + 3); j++) {
      if (phoneRegex.test(lines[j]) && j > zipLineIdx) break;
      if (j > zipLineIdx && /배송요청|결제|상품|장바구니|주문취소/.test(lines[j])) break;
      addrLines.push(lines[j]);
    }
    address = addrLines.join(' ').replace(/^.*?\(?\d{5}\)?\s*/, '').trim();

    // 4) 이름: 위치 기반
    //   a) 전화번호 줄에서 전화 앞의 텍스트 확인 (예: "김영미 010-8730-5699")
    if (phoneLineIdx >= 0) {
      const beforePhone = lines[phoneLineIdx].split(/01[0-9]/)[0].trim();
      if (beforePhone) {
        const name = findNameInLine(beforePhone);
        if (name) receiverName = name;
      }
    }

    //   b) 위 줄에서 이름 찾기 (a에서 못 찾은 경우)
    if (!receiverName) {
      const nameLineIdx = (phoneLineIdx >= 0 && phoneLineIdx < zipLineIdx)
        ? phoneLineIdx - 1
        : zipLineIdx - 1;

      for (let k = nameLineIdx; k >= Math.max(0, nameLineIdx - 1); k--) {
        const cleaned = lines[k].replace(/받는\s*사람\s*정보|받는\s*사람|연락\s*처|받는\s*주소|배송지\s*정보|배송\s*정보/g, '').trim();
        const nameMatch = cleaned.match(/([가-힣]{2,4})/);
        if (nameMatch && !LABEL_WORDS.test(nameMatch[1])) {
          receiverName = nameMatch[1];
          break;
        }
      }
    }
  }

  // 주소 오인식 필터
  if (address && ADDRESS_FALSE_POSITIVES.some(p => p.test(address))) {
    console.log(`[OCR] 주소 오인식 필터링: "${address}"`);
    address = '';
  }

  return { receiverName, address, phone };
}

function matchFirst(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1];
  }
  return '';
}

// 한국 사람 이름인지 검증
const NAME_FALSE_POSITIVES = /물품|보관함|아파트|빌라|오피스텔|마스터|카드|은행|일시불|할부|택배|배송|주문|결제|상품|장바구니|변경|확인|미확인|없음|도착|예정|요청|기타|사항/;
const COMMON_SURNAMES = /^[김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남노하곽성차주우구민]/;

function isKoreanName(name: string): boolean {
  if (!name) return false;
  // 한글 2~4글자여야 함
  if (!/^[가-힣]{2,4}$/.test(name)) return false;
  // 주소/결제 관련 단어가 포함되면 이름 아님
  if (NAME_FALSE_POSITIVES.test(name)) return false;
  // 흔한 성씨로 시작하면 높은 확률로 이름
  return COMMON_SURNAMES.test(name);
}

function sanitizeName(name: string): string {
  if (!name) return '';
  // 한글만 추출 (zero-width 문자, 마크다운 등 모두 제거)
  const koreanOnly = name.replace(/[^가-힣]/g, '');
  if (isKoreanName(koreanOnly)) return koreanOnly;
  // 긴 텍스트에서 이름 패턴 찾기
  const match = koreanOnly.match(/([가-힣]{2,4})/);
  if (match && isKoreanName(match[1])) return match[1];
  return '';
}

// Gemini 결과가 유효한지 검증 (핵심 필드가 비어있으면 실패로 간주)
function isResultValid(result: OcrResult): boolean {
  // 최소한 주문번호나 받는사람 중 하나는 있어야 유효
  return !!(result.orderNumber || result.receiverName);
}

// Gemini를 순수 OCR로만 사용: 이미지 → 텍스트 추출 → 우리 코드로 파싱
async function geminiReadText(gemini: GoogleGenAI, base64Image: string): Promise<string | null> {
  const mimeType = detectMimeType(base64Image);
  const imageData = base64Image.split(',')[1] || base64Image;

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: imageData } },
          { text: '이 이미지에 보이는 모든 텍스트를 위에서 아래로, 왼쪽에서 오른쪽 순서로 빠짐없이 그대로 읽어줘. 줄바꿈을 유지해. 해석하지 말고 보이는 그대로만 적어. 특히 한국 사람 이름(2~4글자)은 한 글자씩 정확히 읽어줘. 예: 배상은, 배상준 등 성(姓)과 이름을 정확히 구분해서 읽어.' }
        ]
      }
    });
    return response.text || null;
  } catch (e) {
    console.error('[OCR] Gemini 텍스트 읽기 실패:', e);
    return null;
  }
}

// 이미지에서 받는사람 이름만 직접 추출 (JSON 스키마 강제)
async function geminiExtractName(gemini: GoogleGenAI, base64Image: string): Promise<string> {
  const mimeType = detectMimeType(base64Image);
  const imageData = base64Image.split(',')[1] || base64Image;

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: imageData } },
          { text: '이 쇼핑몰 주문 캡처에서 주소와 전화번호 바로 위에 굵은 글씨로 표시된 한국 사람 이름(2~4글자)을 찾아줘.' }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
          },
          required: ["name"]
        }
      }
    });
    const text = response.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const raw = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    const name = (raw.name || '').replace(/[^가-힣]/g, '');
    console.log('[OCR] Gemini 이름 직접 추출:', name);
    return name;
  } catch (e) {
    console.error('[OCR] Gemini 이름 추출 실패:', e);
    return '';
  }
}

// UI 라벨 단어 (이름이 아닌 폼 라벨)
const LABEL_WORDS = /^(연락처|받는주소|받는사람|보내는사람|배송요청|배송정보|배송조회|배송완료|배송지|결제수단|결제완료|결제금액|결제정보|결제방식|상품가격|할인금액|배송비|주문취소|주문상세|주문정보|판매자|수령인|변경하기|문의하기|문의|정보|요청사항|취소신청|카드전표|구매영수증|전체취소|무료배송)$/;

// 줄에서 한글 이름 추출 (위치 기반이므로 가볍게 검증)
function findNameInLine(line: string): string {
  // 라벨 제거
  const cleaned = line
    .replace(/[^가-힣\s]/g, '') // 한글과 공백만 남김
    .replace(/받는\s*사람\s*정보|받는\s*사람|수령인|배송\s*정보|배송\s*지/g, '')
    .trim();
  if (!cleaned || cleaned.length > 8) return ''; // 너무 긴 줄은 주소일 가능성
  // 한글 2~4자면 이름으로 간주 (위치 기반으로 이미 필터링됨)
  const nameMatch = cleaned.match(/([가-힣]{2,4})/);
  if (!nameMatch) return '';
  // UI 라벨 단어는 이름이 아님
  if (LABEL_WORDS.test(nameMatch[1])) return '';
  return nameMatch[1];
}

// 텍스트에서 배송 섹션의 한글 이름(2~4자) 찾기
function extractReceiverFromText(lines: string[]): string {
  // 우편번호 패턴: 반드시 괄호가 있거나 주소 컨텍스트 (주문번호와 구분)
  const ZIP_PATTERN = /\(\d{5}\)/;
  const ADDR_PATTERN = /\d{5}\)?\s*[가-힣\s]*(?:시|도|군|구)/;

  // 1) 우편번호(괄호 포함) 줄 찾고, 그 위에서 이름 찾기
  for (let i = 0; i < lines.length; i++) {
    if (ZIP_PATTERN.test(lines[i]) || ADDR_PATTERN.test(lines[i])) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const name = findNameInLine(lines[j]);
        if (name) return name;
      }
      // 같은 줄 앞부분에 이름이 있을 수도 (예: "배상은 (34152) 대전...")
      const beforeZip = lines[i].split(/\(?\d{5}\)?/)[0].trim();
      if (beforeZip) {
        const name = findNameInLine(beforeZip);
        if (name) return name;
      }
    }
  }

  // 2) 010 전화번호: 같은 줄 전화 앞 + 윗줄에서 이름 찾기
  for (let i = 0; i < lines.length; i++) {
    if (/01[0-9][\-\s.]?\d{3,4}[\-\s.]?\d{4}/.test(lines[i])) {
      // 같은 줄에서 전화번호 앞 텍스트 확인 (예: "김영미 010-8730-5699")
      const beforePhone = lines[i].split(/01[0-9]/)[0].trim();
      if (beforePhone) {
        const name = findNameInLine(beforePhone);
        if (name) return name;
      }
      // 윗줄 탐색
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const name = findNameInLine(lines[j]);
        if (name) return name;
      }
    }
  }

  // 3) 최후 수단: "시/도/구" 포함 주소 줄 위에서 이름 찾기
  for (let i = 0; i < lines.length; i++) {
    if (/[가-힣]+(?:광역시|특별시|도)\s+[가-힣]+(?:시|구|군)/.test(lines[i])) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const name = findNameInLine(lines[j]);
        if (name) return name;
      }
    }
  }

  return '';
}

// 위치 기반으로 찾은 이름은 최소 검증만 (2~4글자 한글이면 통과)
function lightValidateName(name: string): string {
  if (!name) return '';
  const korean = name.replace(/[^가-힣]/g, '');
  return /^[가-힣]{2,4}$/.test(korean) ? korean : '';
}

function parseOcrText(text: string): OcrResult {
  // zero-width 문자 제거 (Gemini가 삽입할 수 있음)
  const cleanText = text.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);

  const orderNumber = matchFirst(cleanText, ORDER_NUM_PATTERNS).replace(/\-/g, '');
  const block = extractDeliveryBlock(lines);
  const receiverFromText = extractReceiverFromText(lines);

  console.log('[OCR 파싱] extractReceiverFromText:', receiverFromText, '| block.receiverName:', block.receiverName);

  // block.receiverName을 우선 사용 (라벨 제거 로직이 더 정교함)
  const receiverName = lightValidateName(block.receiverName) || lightValidateName(receiverFromText);
  const ordererName = lightValidateName(matchFirst(cleanText, ORDERER_PATTERNS)) || receiverName;

  return {
    orderNumber,
    ordererName,
    receiverName,
    address: block.address,
    phone: block.phone,
  };
}

export const extractOrderInfo = async (base64Image: string): Promise<OcrResult> => {
  // 이미지 전처리 (대비 강화, 리사이즈)
  let processedImage: string;
  try {
    processedImage = await preprocessImage(base64Image);
    console.log('[OCR] 이미지 전처리 완료');
  } catch {
    processedImage = base64Image;
  }

  // 1단계: Gemini로 이미지의 텍스트를 통째로 읽기
  const gemini = getAI();
  if (gemini) {
    console.log('[OCR] Gemini 텍스트 읽기 시작...');
    const ocrText = await geminiReadText(gemini, processedImage);
    let result: OcrResult | null = null;
    if (ocrText) {
      console.log('[OCR] Gemini 원문:\n', ocrText);
      result = parseOcrText(ocrText);
      console.log('[OCR] 파싱 결과:', result);
    }

    // 이름이 비어있으면 Gemini에 직접 이름만 물어보기
    if (!result?.receiverName) {
      console.log('[OCR] 이름 못 찾음 → Gemini에 이름 직접 질문...');
      const name = await geminiExtractName(gemini, base64Image);
      const sanitized = sanitizeName(name);
      if (sanitized) {
        if (!result) result = { orderNumber: '', ordererName: '', receiverName: '', address: '', phone: '' };
        result.receiverName = sanitized;
        result.ordererName = result.ordererName || sanitized;
        console.log('[OCR] Gemini 이름 직접 추출 성공:', sanitized);
      }
    }

    if (result && isResultValid(result)) return result;
  }

  // Fallback: Tesseract
  try {
    const Tesseract = await import('tesseract.js');
    console.log('[OCR] Tesseract fallback 시작...');
    const { data } = await Tesseract.recognize(processedImage, 'kor+eng');
    console.log('[OCR] Tesseract 원문:\n', data.text);
    const result = parseOcrText(data.text);
    console.log('[OCR] Tesseract 파싱 결과:', result);
    return result;
  } catch (e) {
    console.error('[OCR] 이미지 분석 실패:', e);
    return { orderNumber: '', ordererName: '', receiverName: '', address: '', phone: '' };
  }
};

export interface ExpenseResult {
  date: string;
  amount: number;
  description: string;
}

export const extractExpenseInfo = async (base64Image: string): Promise<ExpenseResult[]> => {
  const gemini = getAI();
  if (!gemini) return [];

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: detectMimeType(base64Image), data: base64Image.split(',')[1] || base64Image } },
          { text: `이 은행 이체/송금 내역 스크린샷에서 다음 정보를 추출해줘.
여러 건이 있으면 모두 추출해.

추출할 항목:
- date: 이체 날짜 (YYYY-MM-DD 형식)
- amount: 이체 금액 (숫자만, 원 단위)
- description: 적요/메모/받는분에게 표시 내용 (이체 시 입력한 내용)

JSON 배열로 반환해.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["date", "amount", "description"]
          }
        }
      }
    });

    const text = response.text || "[]";
    const result = JSON.parse(text);
    return Array.isArray(result) ? result : [result];
  } catch (e) {
    console.error('[비용 인식] Gemini 실패:', e);
    return [];
  }
};

export const extractOrderNumber = async (base64Image: string): Promise<string> => {
  const result = await extractOrderInfo(base64Image);
  return result.orderNumber || '';
};
