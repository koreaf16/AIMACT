export const API_BASE = 'http://localhost:4000';

export const ROLE_CONFIG = {
  Architect: { label: '설계', icon: 'Database', color: 'blue', description: '시스템 설계 및 아키텍처' },
  Coder:     { label: '코딩', icon: 'Code', color: 'green', description: '코드 작성 및 구현' },
  Debugger:  { label: '디버그', icon: 'ShieldAlert', color: 'orange', description: '버그 분석 및 수정' },
  Bulk:      { label: '벌크', icon: 'Cpu', color: 'purple', description: '대량 처리 작업' },
} as const;
