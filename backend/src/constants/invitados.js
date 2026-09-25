// Factor de reparto: qué tanto se separan las 6 habilidades del promedio cargado
// según el peso de cada atributo en la posición del invitado (mismos pesos que usa
// el motor de rating post-partido, ver ratingService/PESOS_POSICION).
const K_INVITADO = 2;

const ESTADOS_INVITADO = ['pendiente', 'aprobado', 'rechazado'];

module.exports = { K_INVITADO, ESTADOS_INVITADO };
