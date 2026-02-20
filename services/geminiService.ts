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
      model: 'gemini-1.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image.split(',')[1] || base64Image } },
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

    const text = response.text() || "{}";
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
    //   전화가 우편번호 위 → PC → 이름은 전화 윗줄
    //   전화가 우편번호 아래(또는 없음) → 모바일 → 이름은 우편번호 윗줄
    const nameLineIdx = (phoneLineIdx >= 0 && phoneLineIdx < zipLineIdx)
      ? phoneLineIdx - 1
      : zipLineIdx - 1;

    // nameLineIdx에서 최대 1줄 위까지 탐색 (라벨만 있는 줄 대비)
    for (let k = nameLineIdx; k >= Math.max(0, nameLineIdx - 1); k--) {
      // 헤더 구문("받는사람 정보") 및 라벨 제거 후 한글 이름 추출
      const cleaned = lines[k].replace(/받는\s*사람\s*정보|받는\s*사람|연락\s*처|받는\s*주소/g, '').trim();
      const nameMatch = cleaned.match(/([가-힣]{2,4})/);
      if (nameMatch) {
        receiverName = nameMatch[1];
        break;
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

export const extractOrderInfo = async (base64Image: string): Promise<OcrResult> => {
  try {
    const Tesseract = await import('tesseract.js');

    console.log('[OCR] Tesseract 로드 완료, 이미지 분석 시작...');
    const { data } = await Tesseract.recognize(base64Image, 'kor+eng');

    const text = data.text;
    console.log('[OCR] 인식된 텍스트:', text);

    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l);

    const orderNumber = matchFirst(text, ORDER_NUM_PATTERNS).replace(/\-/g, '');

    // 배송정보 블록에서 연락처/주소/받는사람 추출 (패턴 기반, 헤더 매칭 없음)
    const block = extractDeliveryBlock(lines);
    const receiverName = block.receiverName;
    const address = block.address;
    const phone = block.phone;

    const ordererName = matchFirst(text, ORDERER_PATTERNS) || receiverName;

    console.log(`[OCR] 추출 결과 → 주문번호: ${orderNumber}, 받는사람: ${receiverName}, 주소: ${address}, 연락처: ${phone}`);

    return { orderNumber, ordererName, receiverName, address, phone };
  } catch (e) {
    console.error('[OCR] 이미지 분석 실패:', e);
    return { orderNumber: '', ordererName: '', receiverName: '', address: '', phone: '' };
  }
};

export const extractOrderNumber = async (base64Image: string): Promise<string> => {
  const result = await extractOrderInfo(base64Image);
  return result.orderNumber || '';
};
