// Lista de hábitos. Los `id` son estables: renombrar un hábito no pierde su historial.
// `since` (AAAA-MM-DD) indica desde qué día cuenta el hábito; `until` (opcional) hasta cuándo.
// Para añadir un hábito nuevo, ponle `since` = el día en que empiezas a hacerlo,
// así los días anteriores no parecen peores.
const START = '2020-01-01';

export const BLOCKS = [
  {
    id: 'm', name: 'Mañana', habits: [
      { id: 'mano', label: 'Ejercicio de la mano', since: START },
      { id: 'respiracion', label: 'Respiración profunda', hint: '3–4 min, fijándome en el aire', since: START },
      { id: 'cuello', label: 'Cuello: sí, no, quizá', hint: '3–4 min', since: START },
    ],
  },
  {
    id: 'd', name: 'Día', habits: [
      { id: 'sin-azucar', label: 'Sin azúcar', since: START },
      { id: 'verdura', label: 'Verdura en las comidas', since: START },
      { id: 'ejercicio', label: 'Ejercicio físico', since: START },
      { id: 'compartir', label: 'Compartí cómo me siento', since: START },
      { id: 'dialogo', label: 'Me hablé con cariño', hint: 'Llevar de la mano al niño interior', since: START },
      { id: 'isla', label: 'Una isla de tiempo', hint: 'Saber parar', since: START },
    ],
  },
  {
    id: 'n', name: 'Noche', habits: [
      { id: 'gratitud', label: 'Gratitud', hint: '¿Qué ha ido bien?', since: START },
      { id: 'escaneo', label: 'Escaneo corporal', hint: '3–4 min, tensar y soltar', since: START },
      { id: 'abrazo', label: 'Abrazo de 20 s', since: START },
      { id: 'sin-pantallas', label: '20 min sin pantallas', since: START },
      { id: 'cama-23', label: 'En la cama a las 23h', since: START },
    ],
  },
];

export const DIMENSIONS = [
  { id: 'emociones', label: 'Emociones', q: '¿Cuánta ansiedad, agobio o rumiación mental te produce?' },
  { id: 'salud_fisica', label: 'Salud física', q: '¿Tensión muscular, dolor de cabeza, nudo en el estómago?' },
  { id: 'relaciones', label: 'Relaciones', q: '¿Te hace estar irritable o ausente con tus seres queridos?' },
  { id: 'rendimiento', label: 'Rendimiento diario', q: '¿Te quita claridad mental o te impide avanzar en el trabajo?' },
  { id: 'motivacion', label: 'Motivación', q: '¿Te quita las ganas de emprender otras cosas?' },
  { id: 'vida_general', label: 'Vida general', q: 'Con perspectiva, ¿qué importancia real tiene hoy?' },
];
