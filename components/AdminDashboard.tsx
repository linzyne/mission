
import React, { useState } from 'react';
import { Mission, UserSubmission, MissionStatus } from '../types';

interface Props {
  missions: Mission[];
  submissions: Record<string, UserSubmission>;
  onAddMission: (mission: Mission) => void;
}

const AdminDashboard: React.FC<Props> = ({ missions, submissions, onAddMission }) => {
  const submissionList = Object.values(submissions) as UserSubmission[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // 미션 생성 폼 상태
  const [newMission, setNewMission] = useState({
    title: '',
    thumbnail: '',
    rewardAmount: 0,
    description: '',
    guideUrl: ''
  });

  const selectedSubmission = selectedId ? submissions[selectedId] : null;
  const selectedMission = selectedSubmission ? missions.find(m => m.id === selectedSubmission.missionId) : null;

  const handleAddMission = (e: React.FormEvent) => {
    e.preventDefault();
    const mission: Mission = {
      ...newMission,
      id: 'm-' + Math.random().toString(36).substr(2, 9),
      steps: ['구매', '인증', '리뷰', '완료']
    };
    onAddMission(mission);
    setShowAddForm(false);
    setNewMission({ title: '', thumbnail: '', rewardAmount: 0, description: '', guideUrl: '' });
  };

  const copyLink = (missionId: string) => {
    const link = `${window.location.origin}${window.location.pathname}#/mission/${missionId}`;
    navigator.clipboard.writeText(link);
    alert('참여 링크가 복사되었습니다! 체험단에게 전달해 주세요.');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold mb-2">관리자 대시보드</h1>
          <p className="text-slate-500">새로운 상품 미션을 만들고 링크를 공유하세요.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100"
        >
          {showAddForm ? '닫기' : '+ 새 미션 만들기'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-2xl border-2 border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="font-bold text-lg mb-4">새로운 체험단 미션 추가</h3>
          <form onSubmit={handleAddMission} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input 
              type="text" placeholder="상품명 (예: 유기농 간식)" required
              className="p-3 border rounded-xl"
              value={newMission.title}
              onChange={e => setNewMission({...newMission, title: e.target.value})}
            />
            <input 
              type="number" placeholder="리워드 금액" required
              className="p-3 border rounded-xl"
              value={newMission.rewardAmount || ''}
              onChange={e => setNewMission({...newMission, rewardAmount: Number(e.target.value)})}
            />
            <input 
              type="text" placeholder="썸네일 이미지 URL" required
              className="p-3 border rounded-xl"
              value={newMission.thumbnail}
              onChange={e => setNewMission({...newMission, thumbnail: e.target.value})}
            />
            <input 
              type="text" placeholder="상세 가이드 URL" required
              className="p-3 border rounded-xl"
              value={newMission.guideUrl}
              onChange={e => setNewMission({...newMission, guideUrl: e.target.value})}
            />
            <textarea 
              placeholder="미션 간단 설명" className="p-3 border rounded-xl md:col-span-2"
              value={newMission.description}
              onChange={e => setNewMission({...newMission, description: e.target.value})}
            />
            <button type="submit" className="md:col-span-2 py-3 bg-indigo-600 text-white rounded-xl font-bold">
              미션 저장 및 생성
            </button>
          </form>
        </div>
      )}

      {/* 미션 관리 리스트 */}
      <div className="grid grid-cols-1 gap-4">
        <h3 className="font-bold text-lg">생성된 미션 및 고유 링크</h3>
        {missions.map(m => (
          <div key={m.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <img src={m.thumbnail} className="w-12 h-12 rounded-lg object-cover" alt="" />
              <div>
                <h4 className="font-bold text-sm">{m.title}</h4>
                <p className="text-xs text-slate-400">ID: {m.id} | {m.rewardAmount.toLocaleString()}원</p>
              </div>
            </div>
            <button 
              onClick={() => copyLink(m.id)}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              🔗 참여 링크 복사
            </button>
          </div>
        ))}
      </div>

      {/* 참여 현황 표 */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="p-4 border-b bg-slate-50/50">
          <h3 className="font-bold">최근 참여 고객 현황</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">사용자</th>
                <th className="px-6 py-4">미션명</th>
                <th className="px-6 py-4">상태</th>
                <th className="px-6 py-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissionList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">아직 참여한 고객이 없습니다.</td>
                </tr>
              ) : (
                submissionList.map(s => {
                  const m = missions.find(mission => mission.id === s.missionId);
                  return (
                    <tr key={s.missionId} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold">{s.userName || '이름 미입력'}</div>
                        <div className="text-[10px] text-slate-400">{s.bankName} {s.accountNumber}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{m?.title}</td>
                      <td className="px-6 py-4"><AdminStatusBadge status={s.status} /></td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setSelectedId(s.missionId)} className="text-indigo-600 font-bold text-xs">상세보기</button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기존 모달 코드 유지 (생략) */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold">{selectedSubmission.userName} 님의 인증 상세</h2>
              <button onClick={() => setSelectedId(null)} className="text-2xl">&times;</button>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl">
                  <p className="text-xs text-slate-400 font-bold mb-1">입금 계좌</p>
                  <p className="font-bold">{selectedSubmission.userName} | {selectedSubmission.bankName} {selectedSubmission.accountNumber}</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">승인/정산완료</button>
                  <button className="flex-1 py-3 border border-red-200 text-red-600 rounded-xl font-bold">반려</button>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold mb-2">구매 인증</p>
                  <img src={selectedSubmission.purchaseProofImage} className="w-full rounded-xl border" alt="" />
                </div>
                <div>
                  <p className="text-xs font-bold mb-2">리뷰 인증</p>
                  <img src={selectedSubmission.reviewProofImage} className="w-full rounded-xl border" alt="" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminStatusBadge: React.FC<{ status: MissionStatus }> = ({ status }) => {
  const styles = {
    [MissionStatus.NOT_STARTED]: 'text-slate-400',
    [MissionStatus.PURCHASE_PENDING]: 'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded',
    [MissionStatus.PURCHASE_VERIFIED]: 'text-blue-600 bg-blue-50 px-2 py-0.5 rounded',
    [MissionStatus.REVIEW_PENDING]: 'text-orange-600 bg-orange-50 px-2 py-0.5 rounded',
    [MissionStatus.COMPLETED]: 'text-green-600 bg-green-50 px-2 py-0.5 rounded',
    [MissionStatus.REJECTED]: 'text-red-600 bg-red-50 px-2 py-0.5 rounded',
  };
  return <span className={`text-[11px] font-bold ${styles[status]}`}>{status}</span>;
}

export default AdminDashboard;
