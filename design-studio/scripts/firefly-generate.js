#!/usr/bin/env node
// Generación de imágenes por IA (texto → imagen) con Adobe Firefly Services API.
// Esto NO pasa por el conector Adobe for Creativity conectado a esta sesión
// (ese conector no incluye generación de imágenes en este entorno) — es una
// integración directa con la API de Firefly, pensada para producir imágenes
// comercialmente seguras (Firefly se entrena solo con contenido con licencia
// y de dominio público) para catálogos, banners, redes, etc.
//
// SIN PROBAR: este script no se ha podido ejecutar contra la API real porque
// no hay credenciales configuradas todavía. Antes de confiar en él en
// producción, pruébalo una vez que tengas FIREFLY_CLIENT_ID/SECRET.
//
// Requisitos previos (una sola vez, en Adobe Developer Console):
//   1. Entra en https://developer.adobe.com/console y crea (o reutiliza) un proyecto.
//   2. "Add API" → busca "Firefly API" (dentro de Firefly Services) → añádela.
//   3. Elige credencial "OAuth Server-to-Server".
//   4. Copia el Client ID y el Client Secret generados.
//   5. Expórtalos como variables de entorno (nunca los pegues en código ni los subas al repo):
//        export FIREFLY_CLIENT_ID="..."
//        export FIREFLY_CLIENT_SECRET="..."
//
// Uso:
//   node firefly-generate.js "<prompt>" <salida.png> [ancho] [alto] [contentClass]
//
// Ejemplo:
//   node firefly-generate.js "estantería de papelería moderna, luz natural, foto de producto" \
//     output/estanteria.png 2048 2048 photo
//
// Nota de coste: la API de Firefly es de pago por generación por encima de la
// cuota gratuita del plan de Adobe — revisa el pricing antes de automatizar
// llamadas en bucle o en un pipeline sin supervisión.

const fs = require('fs');
const path = require('path');

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const FIREFLY_GENERATE_URL = 'https://firefly-api.adobe.io/v3/images/generate';
// Scope estándar documentado por Adobe para credenciales Server-to-Server de
// Firefly Services. Verifica en tu proyecto de Developer Console si difiere.
const IMS_SCOPE = 'openid,AdobeID,session,additional_info.projectedProductContext,additional_info.roles,firefly_api,ff_apis';

async function getAccessToken(clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: IMS_SCOPE,
  });

  const resp = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Fallo obteniendo token IMS: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function generateImage({ clientId, accessToken, prompt, width, height, contentClass }) {
  const resp = await fetch(FIREFLY_GENERATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': clientId,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      prompt,
      contentClass: contentClass || 'photo', // 'photo' | 'art'
      size: { width, height },
      numVariations: 1,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Fallo generando imagen: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  const imageUrl = data?.outputs?.[0]?.image?.url;
  if (!imageUrl) {
    throw new Error(`Respuesta de Firefly sin imagen: ${JSON.stringify(data)}`);
  }
  return imageUrl;
}

async function downloadImage(url, outputPath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fallo descargando imagen generada: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

async function main() {
  const [, , prompt, outputArg, widthArg, heightArg, contentClass] = process.argv;

  if (!prompt || !outputArg) {
    console.error('Uso: node firefly-generate.js "<prompt>" <salida.png> [ancho] [alto] [contentClass]');
    process.exit(1);
  }

  const clientId = process.env.FIREFLY_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      'Faltan FIREFLY_CLIENT_ID / FIREFLY_CLIENT_SECRET en el entorno.\n' +
      'Ver instrucciones de configuración en la cabecera de este script y en design-studio/README.md.'
    );
    process.exit(1);
  }

  const width = parseInt(widthArg, 10) || 1024;
  const height = parseInt(heightArg, 10) || 1024;
  const outputPath = path.resolve(outputArg);

  const accessToken = await getAccessToken(clientId, clientSecret);
  const imageUrl = await generateImage({ clientId, accessToken, prompt, width, height, contentClass });
  await downloadImage(imageUrl, outputPath);

  console.log(`Generado: ${outputPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
