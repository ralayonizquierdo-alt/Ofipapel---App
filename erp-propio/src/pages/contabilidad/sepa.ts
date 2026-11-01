// Fichero de remesa SEPA de adeudos directos (ISO 20022 pain.008.001.02, el antiguo Cuaderno 19): el
// mismo para Santander, BBVA, CaixaBank y Cajasiete. Un bloque de pago por esquema (CORE / B2B).
// Los datos los da fn_remesa_datos_xml (migración 20261101_remesas_sepa).

export interface DatosRemesa {
  referencia: string
  fecha_cargo: string
  num: number
  total: number
  acreedor: { nombre: string; cif: string | null; id: string; iban: string; bic: string | null }
  recibos: {
    e2e: string
    importe: number
    concepto: string
    mandato: string
    firma: string
    tipo: 'CORE' | 'B2B'
    iban: string
    bic: string | null
    deudor: string
  }[]
}

/** Texto en el juego de caracteres SEPA (sin tildes ni símbolos), recortado. */
export function textoSepa(s: string | null | undefined, max: number) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N'))
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const limpio = (iban: string) => iban.replace(/\s/g, '').toUpperCase()
const importe = (n: number) => Number(n).toFixed(2)
const agente = (bic: string | null) =>
  bic && bic.trim() ? `<FinInstnId><BIC>${esc(bic.trim().toUpperCase())}</BIC></FinInstnId>` : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>'

/** IBAN válido (dígitos de control, módulo 97). */
export function ibanValido(iban: string) {
  const s = limpio(iban)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let resto = 0
  for (const d of r) resto = (resto * 10 + Number(d)) % 97
  return resto === 1
}

export function xmlRemesa(d: DatosRemesa) {
  const ahora = new Date().toISOString().slice(0, 19)
  const nombre = esc(textoSepa(d.acreedor.nombre, 70))
  const grupos = (['CORE', 'B2B'] as const).map((t) => ({ t, recibos: d.recibos.filter((r) => r.tipo === t) })).filter((g) => g.recibos.length)
  const suma = (rs: DatosRemesa['recibos']) => rs.reduce((s, r) => s + Math.round(Number(r.importe) * 100), 0) / 100
  const bloques = grupos
    .map(
      (g) => `
    <PmtInf>
      <PmtInfId>${esc(d.referencia)}-${g.t}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${g.recibos.length}</NbOfTxs>
      <CtrlSum>${importe(suma(g.recibos))}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>${g.t}</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
      <ReqdColltnDt>${d.fecha_cargo}</ReqdColltnDt>
      <Cdtr><Nm>${nombre}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${limpio(d.acreedor.iban)}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${agente(d.acreedor.bic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${esc(d.acreedor.id.trim())}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>${g.recibos
        .map(
          (r) => `
      <DrctDbtTxInf>
        <PmtId><EndToEndId>${esc(r.e2e)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${importe(r.importe)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${esc(textoSepa(r.mandato, 35))}</MndtId><DtOfSgntr>${r.firma}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt>${agente(r.bic)}</DbtrAgt>
        <Dbtr><Nm>${esc(textoSepa(r.deudor, 70))}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${limpio(r.iban)}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${esc(textoSepa(r.concepto, 140))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`,
        )
        .join('')}
    </PmtInf>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(d.referencia)}</MsgId>
      <CreDtTm>${ahora}</CreDtTm>
      <NbOfTxs>${d.recibos.length}</NbOfTxs>
      <CtrlSum>${importe(suma(d.recibos))}</CtrlSum>
      <InitgPty><Nm>${nombre}</Nm><Id><OrgId><Othr><Id>${esc(d.acreedor.id.trim())}</Id></Othr></OrgId></Id></InitgPty>
    </GrpHdr>${bloques}
  </CstmrDrctDbtInitn>
</Document>
`
}

export function descargarXml(nombre: string, xml: string) {
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
