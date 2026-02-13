
import React from 'react';
import { Link } from 'react-router-dom';
import { Mission, UserSubmission, MissionStatus } from '../types';

interface Props {
  missions: Mission[];
  submissions: Record<string, UserSubmission>;
}

const MissionList: React.FC<Props> = ({ missions, submissions }) => {
  // 사용자가 이미 참여 중인 미션들만 필터링
  // Fix: Cast Object.values to UserSubmission[] to ensure TypeScript recognizes the properties on 's'
  const ongoingSubmissions = (Object.values(submissions) as UserSubmission[]).filter(s => s.status !== MissionStatus.NOT_STARTED);
  const ongoingMissions = missions.filter(m => ongoingSubmissions.some(s => s.missionId === m.id));

  return (
    <div className="py-12 flex flex-col items-center justify-center text-center">
      {ongoingMissions.length > 0 ? (
        <div className="w-full max-w-4xl text-left">
          <h1 className="text-2xl font-bold mb-6">진행 중인 미션</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ongoingMissions.map(mission => (
              <MissionCard key={mission.id} mission={mission} status={submissions[mission.id].status} />
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-md">
          <div className="text-6xl mb-6">🔗</div>
          <h1 className="text-2xl font-bold mb-4">배정된 미션 링크로 접속해 주세요</h1>
          <p className="text-slate-500 leading-relaxed mb-8">
            이 서비스는 개별 체험단 분들께 배정된 고유 링크를 통해서만 참여가 가능합니다. 
            담당자에게 전달받은 미션 참여 링크(URL)를 확인해 주세요.
          </p>
          <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-700 text-sm font-medium">
            💡 한 번 참여를 시작하면 이 페이지에서 확인이 가능합니다.
          </div>
        </div>
      )}
    </div>
  );
};

const MissionCard: React.FC<{ mission: Mission; status: MissionStatus }> = ({ mission, status }) => {
  return (
    <Link 
      to={`/mission/${mission.id}`}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-100 flex flex-col"
    >
      <div className="relative aspect-[16/9]">
        <img src={mission.thumbnail} className="w-full h-full object-cover" alt="" />
        <div className="absolute top-3 right-3">
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-bold text-lg mb-1">{mission.title}</h3>
        <p className="text-indigo-600 font-bold text-sm">{mission.rewardAmount.toLocaleString()}원 리워드</p>
      </div>
    </Link>
  );
};

const StatusBadge: React.FC<{ status: MissionStatus }> = ({ status }) => {
  const styles = {
    [MissionStatus.NOT_STARTED]: 'bg-slate-500 text-white',
    [MissionStatus.PURCHASE_PENDING]: 'bg-yellow-400 text-yellow-900',
    [MissionStatus.PURCHASE_VERIFIED]: 'bg-blue-500 text-white',
    [MissionStatus.REVIEW_PENDING]: 'bg-orange-500 text-white',
    [MissionStatus.COMPLETED]: 'bg-green-500 text-white',
    [MissionStatus.REJECTED]: 'bg-red-500 text-white',
  };
  return <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${styles[status]}`}>{status}</span>;
};

export default MissionList;
