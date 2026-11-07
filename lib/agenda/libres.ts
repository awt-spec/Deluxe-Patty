// Ratos libres de un día para "Tu día": el horario de visitas menos visitas y bloqueos, en minutos
// del día. Si el día es hoy, lo que ya pasó no cuenta: el rato empieza en la próxima media hora (no se
// ofrece agendar a una hora que ya pasó). Solo ratos de 30 minutos o más.

export interface Rato {
  desde: number;
  hasta: number;
}

export function ratosLibres(franjas: Rato[], ocupado: Rato[], ahoraMin: number | null = null): Rato[] {
  const desdeAhora = ahoraMin === null ? null : Math.ceil(ahoraMin / 30) * 30;
  const libres: Rato[] = [];
  for (const f of franjas) {
    let tramos: Rato[] = [{ ...f }];
    for (const o of ocupado) {
      tramos = tramos.flatMap((t) =>
        o.hasta <= t.desde || o.desde >= t.hasta
          ? [t]
          : [
              ...(o.desde > t.desde ? [{ desde: t.desde, hasta: o.desde }] : []),
              ...(o.hasta < t.hasta ? [{ desde: o.hasta, hasta: t.hasta }] : []),
            ],
      );
    }
    for (const t of tramos) {
      const desde = desdeAhora === null ? t.desde : Math.max(t.desde, desdeAhora);
      if (t.hasta - desde >= 30) libres.push({ desde, hasta: t.hasta });
    }
  }
  return libres.sort((a, b) => a.desde - b.desde);
}
