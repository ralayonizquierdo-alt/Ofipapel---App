#!/bin/bash
set -e

# Build the alquileres React app
cd alquileres
npm ci
npm run build
cd ..

# Build the joe-app React app
cd joe-app
npm ci
npm run build
cd ..

# Assemble _site: static root files + built apps
mkdir -p _site/alquileres
mkdir -p _site/joe

# Copy root static files
cp index.html _site/
cp Index.html _site/ 2>/dev/null || true
cp canarias-ink.html _site/ 2>/dev/null || true
cp falcontrol.html _site/ 2>/dev/null || true
cp vacaciones.html _site/ 2>/dev/null || true
cp fichaje.html _site/ 2>/dev/null || true
cp importacion-pedidos-proveedores.html _site/ 2>/dev/null || true
cp sw.js _site/ 2>/dev/null || true
cp sw-ink.js _site/ 2>/dev/null || true
cp hero-productos.jpg _site/ 2>/dev/null || true
cp logo-canarias-ink.png _site/ 2>/dev/null || true
cp logo-ofipapel.png _site/ 2>/dev/null || true
cp fondo-ofipapel.jpg _site/ 2>/dev/null || true
cp fondo-conversaciones.jpg _site/ 2>/dev/null || true
cp bg-trebol.png _site/ 2>/dev/null || true
cp privacidad.html _site/ 2>/dev/null || true
cp 404.html _site/ 2>/dev/null || true

# Copy the built apps
cp -r alquileres/dist/. _site/alquileres/
cp -r joe-app/dist/. _site/joe/

# SPA routing
{
  echo "/alquileres/*  /alquileres/index.html  200"
  echo "/joe/*         /joe/index.html          200"
} > _site/_redirects
