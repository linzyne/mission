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

// 받는사람(수취인) 이름 추출 패턴
const RECEIVER_PATTERNS = [
  /받는\s*사람\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /받는\s*사람\s*\n\s*([가-힣]{2,5})/,
  /수취인\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /수취인\s*\n\s*([가-힣]{2,5})/,
  /수령인\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /받는\s*분\s*[:.·\-]?\s*([가-힣]{2,5})/,
];

// 주문자(보내는사람) 이름 추출 패턴
const ORDERER_PATTERNS = [
  /주문자\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /주문자\s*\n\s*([가-힣]{2,5})/,
  /보내는\s*사람\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /보내는\s*분\s*[:.·\-]?\s*([가-힣]{2,5})/,
  /구매자\s*[:.·\-]?\s*([가-힣]{2,5})/,
];

// 연락처 추출 패턴
const PHONE_PATTERNS = [
  /연락처\s*[:.·\-]?\s*(01[016789][\-\s]?\d{3,4}[\-\s]?\d{4})/,
  /휴대폰\s*[:.·\-]?\s*(01[016789][\-\s]?\d{3,4}[\-\s]?\d{4})/,
  /전화\s*번호?\s*[:.·\-]?\s*(01[016789][\-\s]?\d{3,4}[\-\s]?\d{4})/,
  /(01[016789]-\d{3,4}-\d{4})/,
];

// 주소+이름+연락처를 줄 단위로 추출 (우편번호 기준)
function extractAddressBlock(lines: string[]) {
  let receiverName = '';
  let address = '';
  let phone = '';
  const phoneRegex = /01[016789][\-\s]?\d{3,4}[\-\s]?\d{4}/;

  for (let i = 0; i < lines.length; i++) {
    // (우편번호)로 시작하는 줄 = 주소 시작
    if (/^\(?\d{5}\)?/.test(lines[i])) {
      // 윗줄 = 이름
      if (i > 0) {
        const nameMatch = lines[i - 1].match(/([가-힣]{2,5})/);
        if (nameMatch) receiverName = nameMatch[1];
      }
      // 주소: 우편번호 줄부터 연락처 직전까지
      const addrLines: string[] = [];
      for (let j = i; j < lines.length; j++) {
        if (phoneRegex.test(lines[j])) {
          const phoneMatch = lines[j].match(phoneRegex);
          if (phoneMatch) phone = phoneMatch[0];
          break;
        }
        addrLines.push(lines[j]);
      }
      address = addrLines.join(' ');
      break;
    }
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
    let receiverName = matchFirst(text, RECEIVER_PATTERNS);
    const phone = matchFirst(text, PHONE_PATTERNS);

    // 우편번호 기준으로 주소/이름/연락처 추출
    const block = extractAddressBlock(lines);
    const address = block.address;
    if (!receiverName && block.receiverName) receiverName = block.receiverName;
    const finalPhone = phone || block.phone;

    const ordererName = matchFirst(text, ORDERER_PATTERNS) || receiverName;

    console.log(`[OCR] 추출 결과 → 주문번호: ${orderNumber}, 받는사람: ${receiverName}, 주소: ${address}, 연락처: ${finalPhone}`);

    return { orderNumber, ordererName, receiverName, address, phone: finalPhone };
  } catch (e) {
    console.error('[OCR] 이미지 분석 실패:', e);
    return { orderNumber: '', ordererName: '', receiverName: '', address: '', phone: '' };
  }
};

export const extractOrderNumber = async (base64Image: string): Promise<string> => {
  const result = await extractOrderInfo(base64Image);
  return result.orderNumber || '';
};
