export const state = {
  hist: [],
  mem: '',
  msgN: 0,
  audioOn: true,
  mktMode: 'campaña',
  calConn: false,
  audioBlocked: false,
  lastSpokenText: '',
  tasks: JSON.parse(localStorage.getItem('nova_tasks') || '[]')
};