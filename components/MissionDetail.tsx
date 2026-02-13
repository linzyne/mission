
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mission, MissionStatus, UserSubmission } from '../types';
import { verifyImage } from '../services/geminiService';

interface Props {
  missions: Mission[];
  submissions: Record<string, UserSubmission>;
  onUpdate: (submission: UserSubmission) => void;
}

const MissionDetail: React.FC<Props> = ({ missions, submissions, onUpdate }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const mission = missions.find(m => m.id === id);
  const submission = submissions[id || ''] || {
    missionId: id || '',
    status: MissionStatus.NOT_STARTED,
    submittedAt: Date.now(),
    lastUpdatedAt: Date.now()
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    userName: submission.userName || '',
    bankName: submission.bankName || '',
    accountNumber: submission.accountNumber || ''
  });

  if (!mission) return <div className="p-10 text-center">미션을 찾을 수 없습니다.</div>;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'purchase' | 'review') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      
      try {
        // AI Verification using Gemini
        const result = await verifyImage(base64, type);
        
        if (result.valid) {
          const nextStatus = type === 'purchase' ? MissionStatus.PURCHASE_VERIFIED : MissionStatus.COMPLETED;
          onUpdate({
            ...submission,
            status: nextStatus,
            [type === 'purchase' ? 'purchaseProofImage' : 'reviewProofImage']: base64,
            ...formData
          });
        } else {
          setError(`인증 실패: ${result.reason}`);
        }
      } catch (err) {
        setError("이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const startMission = () => {
    onUpdate({ ...submission, status: MissionStatus.PURCHASE_PENDING });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button 
        onClick={() => navigate(-1)}
        className="mb-6 text-slate-400 hover:text-slate-600 flex items-center gap-1"
      >
        ← 뒤로가기
      </button>

      <div className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm">
        <img src={mission.thumbnail} className="w-full h-64 object-cover" alt="" />
        
        <div className="p-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{mission.title}</h1>
              <p className="text-indigo-600 font-bold text-xl">{mission.rewardAmount.toLocaleString()}원 리워드</p>
            </div>
            <div className="bg-indigo-50 px-4 py-2 rounded-2xl text-indigo-700 text-sm font-bold">
              {submission.status}
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl mb-8 border border-dashed border-slate-200">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <span className="bg-indigo-600 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">!</span>
              미션 가이드
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-4">{mission.description}</p>
            <a 
              href={mission.guideUrl} 
              target="_blank" 
              rel="noreferrer"
              className="text-indigo-600 text-sm font-semibold underline"
            >
              상세 가이드 문서 보기 ↗
            </a>
          </div>

          <div className="space-y-8 relative">
            {/* Step Line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100 z-0" />

            {/* Step 1: Join */}
            <Step 
              index={1} 
              title="미션 시작하기" 
              active={submission.status === MissionStatus.NOT_STARTED}
              completed={submission.status !== MissionStatus.NOT_STARTED}
            >
              <button 
                onClick={startMission}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                미션 참여하기
              </button>
            </Step>

            {/* Step 2: Purchase Verification */}
            <Step 
              index={2} 
              title="구매 인증 및 정보 입력" 
              active={submission.status === MissionStatus.PURCHASE_PENDING}
              completed={[MissionStatus.PURCHASE_VERIFIED, MissionStatus.REVIEW_PENDING, MissionStatus.COMPLETED].includes(submission.status)}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="text" 
                    placeholder="입금자 성함" 
                    className="p-3 border rounded-xl text-sm"
                    value={formData.userName}
                    onChange={e => setFormData({...formData, userName: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="은행명" 
                    className="p-3 border rounded-xl text-sm"
                    value={formData.bankName}
                    onChange={e => setFormData({...formData, bankName: e.target.value})}
                  />
                </div>
                <input 
                  type="text" 
                  placeholder="계좌번호 (- 제외)" 
                  className="w-full p-3 border rounded-xl text-sm"
                  value={formData.accountNumber}
                  onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                />
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => handleFileUpload(e, 'purchase')}
                    className="hidden" 
                    id="purchase-upload"
                  />
                  <label 
                    htmlFor="purchase-upload"
                    className="w-full flex flex-col items-center justify-center py-8 border-2 border-dashed border-indigo-200 rounded-2xl bg-indigo-50/30 cursor-pointer hover:bg-indigo-50 transition-colors"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    ) : (
                      <>
                        <span className="text-2xl mb-2">📸</span>
                        <span className="text-sm font-medium text-indigo-700">구매 영수증/내역 인증샷 업로드</span>
                        <span className="text-[10px] text-slate-400 mt-1">AI가 실시간으로 확인합니다</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </Step>

            {/* Step 3: Review Verification */}
            <Step 
              index={3} 
              title="리뷰 작성 및 최종 인증" 
              active={submission.status === MissionStatus.PURCHASE_VERIFIED}
              completed={submission.status === MissionStatus.COMPLETED}
            >
              <div className="space-y-4">
                <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-xl">
                  제품을 수령하셨나요? 쇼핑몰에 포토 리뷰를 작성하신 후, 해당 화면을 캡쳐해서 업로드해주세요.
                </p>
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => handleFileUpload(e, 'review')}
                    className="hidden" 
                    id="review-upload"
                    disabled={submission.status !== MissionStatus.PURCHASE_VERIFIED}
                  />
                  <label 
                    htmlFor="review-upload"
                    className={`w-full flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${submission.status === MissionStatus.PURCHASE_VERIFIED ? 'border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50' : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'}`}
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    ) : (
                      <>
                        <span className="text-2xl mb-2">⭐</span>
                        <span className="text-sm font-medium text-indigo-700">리뷰 인증샷 업로드</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </Step>

            {/* Final State */}
            {submission.status === MissionStatus.COMPLETED && (
              <div className="p-6 bg-green-50 rounded-2xl text-center border border-green-100 animate-bounce">
                <span className="text-3xl block mb-2">🎉</span>
                <h3 className="font-bold text-green-800">모든 미션 완료!</h3>
                <p className="text-green-600 text-sm">리워드 정산이 완료되었습니다. 감사합니다.</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Step: React.FC<{ 
  index: number; 
  title: string; 
  active: boolean; 
  completed: boolean; 
  children: React.ReactNode 
}> = ({ index, title, active, completed, children }) => {
  return (
    <div className={`relative z-10 transition-opacity ${!active && !completed ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${completed ? 'bg-green-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
          {completed ? '✓' : index}
        </div>
        <h3 className={`font-bold ${active ? 'text-slate-900' : 'text-slate-500'}`}>{title}</h3>
      </div>
      {(active || (completed && index === 2)) && (
        <div className="ml-12">
          {children}
        </div>
      )}
    </div>
  );
};

export default MissionDetail;
