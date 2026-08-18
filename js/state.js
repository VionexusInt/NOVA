export const state = {
  hist: [],
  mem: '',              // resumen texto (compatibilidad)
  memEstructurada: {},  // memoria estructurada por categorías
  msgN: 0,
  audioOn: true,
  mktMode: 'campaña',
  calConn: false,
  audioBlocked: false,
  lastSpokenText: '',
  tasks: JSON.parse(localStorage.getItem('nova_tasks') || '[]')
};